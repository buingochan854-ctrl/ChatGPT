const {
Client,
GatewayIntentBits,
PermissionsBitField,
AttachmentBuilder,
REST,
Routes,
SlashCommandBuilder
} = require("discord.js");

const { OpenAI } = require("openai");
const express = require("express");
const fs = require("fs");
const axios = require("axios"); // Thêm import axios để tải ảnh

// =========================
// WEB SERVER
// =========================

const app = express();

app.get("/", (req, res) => {
res.send("🤖 Discord AI Bot Online");
});

app.listen(process.env.PORT || 3000, () => {
console.log("Web Server Online");
});

// =========================
// DISCORD CLIENT
// =========================

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

// =========================
// GROQ AI
// =========================

const openai = new OpenAI({
apiKey: process.env.GROQ_API_KEY,
baseURL: "https://api.groq.com/openai/v1"
});

console.log(
"GROQ_API_KEY:",
process.env.GROQ_API_KEY ? "FOUND" : "MISSING"
);

// =========================
// CHATBOT CHANNELS
// =========================

let chatbotChannels = new Map();

if (fs.existsSync("./chatbot.json")) {
chatbotChannels = new Map(
Object.entries(
JSON.parse(
fs.readFileSync("./chatbot.json", "utf8")
)
)
);
}

function saveChannels() {
fs.writeFileSync(
"./chatbot.json",
JSON.stringify(
Object.fromEntries(chatbotChannels),
null,
2
)
);
}

// =========================
// RATE LIMIT
// =========================

const channelRequests = new Map();

const MAX_REQUESTS = 10;
const WINDOW_TIME = 60000;
const LOCK_TIME = 60000;

let aiLocked = false;
let unlockTime = 0;

// =========================
// READY & REGISTER SLASH COMMANDS
// =========================

client.once("ready", async () => { // Đổi từ "clientReady" thành "ready" cho đúng chuẩn discord.js

console.log(`${client.user.tag} Online`);  

client.user.setActivity("GPT VN 🇻🇳 | Groq API");  

// Đăng ký Slash Command khi bot online  
try {  
    const commands = [  
        new SlashCommandBuilder()  
            .setName("image")  
            .setDescription("Tạo ảnh bằng AI")  
            .addStringOption(option =>  
                option  
                    .setName("prompt")  
                    .setDescription("Nhập mô tả ảnh của bạn.")  
                    .setRequired(true)  
            )  
            .toJSON()  
    ];  

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);  

    await rest.put(  
        Routes.applicationCommands(client.user.id),  
        { body: commands }  
    );  

    console.log("Slash Command Loaded");  
} catch (error) {  
    console.error("Lỗi khi đăng ký Slash Command:", error);  
}

});

// =========================
// MESSAGE CREATE
// =========================

client.on("messageCreate", async (message) => {

if (message.author.bot) return;  
if (!message.guild) return;  

// =====================    
// AI LOCK    
// =====================    

if (aiLocked) {  
    const timeLeft = Math.ceil((unlockTime - Date.now()) / 1000);  
    return message.reply(  
        `⚠️ Hệ Thống AI đang tạm dừng để tránh lỗi hệ thống, bạn thử lại sau ${timeLeft} giây nhé!`  
    );  
}  

// =====================    
// ADMIN COMMANDS    
// =====================    

if (message.content === "!chatbot on") {  
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {  
        return message.reply("❌ Chỉ Admin mới dùng được lệnh này.");  
    }  
    chatbotChannels.set(message.guild.id, message.channel.id);  
    saveChannels();  
    return message.reply("✅ Đã bật ChatGPT tại kênh này.");  
}  

if (message.content === "!stats") {  
    const timeLeft = aiLocked ? Math.ceil((unlockTime - Date.now()) / 1000) : 0;  
    return message.reply(  
        `📊 THỐNG KÊ BOT\n\n🏠 Server: ${client.guilds.cache.size}\n👤 User Cache: ${client.users.cache.size}\n📡 Ping: ${client.ws.ping}ms\n\n🤖 AI:\n${aiLocked ? `🔒 Khóa (${timeLeft}s còn lại)` : "🟢 Hoạt động bình thường"}`  
    );  
}  

if (message.content === "!chatbot off") {  
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {  
        return message.reply("❌ Chỉ Admin mới dùng được lệnh này.");  
    }  
    chatbotChannels.delete(message.guild.id);  
    saveChannels();  
    return message.reply("❌ Đã tắt ChatGPT.");  
}  

// =====================    
// CHECK CHANNEL    
// =====================    

if (chatbotChannels.get(message.guild.id) !== message.channel.id) {  
    return;  
}  

// =====================    
// RATE LIMIT    
// =====================    

if (!channelRequests.has(message.channel.id)) {  
    channelRequests.set(message.channel.id, {  
        count: 0,  
        startTime: Date.now()  
    });  
}  

const data = channelRequests.get(message.channel.id);  

if (Date.now() - data.startTime > WINDOW_TIME) {  
    data.count = 0;  
    data.startTime = Date.now();  
}  

data.count++;  

if (data.count > MAX_REQUESTS) {  
    aiLocked = true;  
    unlockTime = Date.now() + LOCK_TIME;  
    console.log("AI LOCKED");  
    await message.channel.send("🔒 Hệ Thống AI đang tạm dừng để tránh lỗi hệ thống.");  

    setTimeout(() => {  
        aiLocked = false;  
        console.log("AI UNLOCKED");  
    }, LOCK_TIME);  

    return;  
}  

// =====================    
// AI CHAT    
// =====================    

try {  
    console.log(`[GROQ] ${message.author.tag}: ${message.content}`);  
    await message.channel.sendTyping();  

    const response = await openai.chat.completions.create({  
        model: "llama-3.1-8b-instant",  
        messages: [  
            { role: "system", content: "Bạn là trợ lý AI thân thiện." },  
            { role: "user", content: message.content }  
        ]  
    });  

    const reply = response.choices?.[0]?.message?.content;  

    if (!reply) {  
        return message.reply("❌ AI không trả về nội dung.");  
    }  

    if (reply.length <= 2000) {  
        return message.reply(reply);  
    }  

    const fileName = `response-${Date.now()}.txt`;  
    fs.writeFileSync(fileName, reply, "utf8");  

    await message.reply({  
        content: "📄 Nội dung quá dài, đã xuất thành file.",  
        files: [new AttachmentBuilder(fileName)]  
    });  

    fs.unlinkSync(fileName);  

} catch (err) {  
    if (err.status === 429 || err.message.includes("429")) {  
        aiLocked = true;  
        unlockTime = Date.now() + 300000; // 5 phút    
        console.log("AI LOCKED BY 429");  

        setTimeout(() => {  
            aiLocked = false;  
            console.log("AI UNLOCKED");  
        }, 300000);  

        return message.reply(  
            "🔒 Hệ thống AI đang tạm dừng do quá nhiều yêu cầu tới Groq. Vui lòng thử lại sau 5 phút."  
        );  
    }  
    console.error("========== AI ERROR ==========");  
    console.error(err);  
    console.error("================================");  
    return message.reply(`❌ Lỗi AI: ${err.message}`);  
}

});

// =========================
// INTERACTION CREATE (LỆNH /IMAGE)
// =========================

client.on("interactionCreate", async (interaction) => {
if (!interaction.isChatInputCommand()) return;
if (interaction.commandName !== "image") return;

const prompt = interaction.options.getString("prompt");  
await interaction.reply("🎨 Đang tạo ảnh...");  

try {  
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;  
     console.log(imageUrl);

    const response = await axios.get(imageUrl, {  
        responseType: "arraybuffer"  
    });  

    const buffer = Buffer.from(response.data);  

    await interaction.editReply({  
        content: `🖼️ Ảnh AI: **${prompt}**`,  
        files: [  
            {  
                attachment: buffer,  
                name: "ai-image.png"  
            }  
        ]  
    });  
} catch (err) {

    console.error(
        "========== IMAGE ERROR =========="
    );

    console.error(
        err.response?.status
    );

    console.error(
        err.message
    );

    console.error(
        "================================="
    );

    await interaction.editReply(
        `❌ Không thể tạo ảnh.\n${err.message}`
    );

}

});

// =========================
// LOGIN
// =========================

client.login(process.env.DISCORD_TOKEN);
