const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    AttachmentBuilder
} = require("discord.js");

const { OpenAI } = require("openai");
const express = require("express");
const fs = require("fs");

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
    process.env.GROQ_API_KEY
        ? "FOUND"
        : "MISSING"
);

// =========================
// CHATBOT CHANNELS
// =========================

let chatbotChannels = new Map();

if (fs.existsSync("./chatbot.json")) {

    chatbotChannels = new Map(
        Object.entries(
            JSON.parse(
                fs.readFileSync(
                    "./chatbot.json",
                    "utf8"
                )
            )
        )
    );

}

function saveChannels() {

    fs.writeFileSync(
        "./chatbot.json",
        JSON.stringify(
            Object.fromEntries(
                chatbotChannels
            ),
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
// READY
// =========================

client.once("clientReady", () => {

    console.log(
        `${client.user.tag} Online`
    );

    client.user.setActivity(
        "GPT VN 🇻🇳 | OpenAI API"
    );

});

// =========================
// MESSAGE CREATE
// =========================

client.on(
    "messageCreate",
    async (message) => {

        if (message.author.bot) return;
        if (!message.guild) return;

        // =====================
        // AI LOCK
        // =====================

        if (aiLocked) {

            const timeLeft =
                Math.ceil(
                    (unlockTime - Date.now()) / 1000
                );

            return message.reply(
                `⚠️ Hệ Thống AI đang tạm dừng để tránh lỗi hệ thống, bạn thử lại sau ${timeLeft} giây nhé!`
            );

        }

        // =====================
        // ADMIN COMMANDS
        // =====================

        if (message.content === "!chatbot on") {

            if (
                !message.member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                )
            ) {
                return message.reply(
                    "❌ Chỉ Admin mới dùng được lệnh này."
                );
            }

            chatbotChannels.set(
                message.guild.id,
                message.channel.id
            );

            saveChannels();

            return message.reply(
                "✅ Đã bật ChatGPT tại kênh này."
            );

        }

        if (message.content === "!chatbot off") {

            if (
                !message.member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                )
            ) {
                return message.reply(
                    "❌ Chỉ Admin mới dùng được lệnh này."
                );
            }

            chatbotChannels.delete(
                message.guild.id
            );

            saveChannels();

            return message.reply(
                "❌ Đã tắt ChatGPT."
            );

        }

        // =====================
        // CHECK CHANNEL
        // =====================

        if (
            chatbotChannels.get(
                message.guild.id
            ) !== message.channel.id
        ) {
            return;
        }

        // =====================
        // RATE LIMIT
        // =====================

        if (
            !channelRequests.has(
                message.channel.id
            )
        ) {

            channelRequests.set(
                message.channel.id,
                {
                    count: 0,
                    startTime: Date.now()
                }
            );

        }

        const data =
            channelRequests.get(
                message.channel.id
            );

        if (
            Date.now() -
            data.startTime >
            WINDOW_TIME
        ) {

            data.count = 0;
            data.startTime = Date.now();

        }

        data.count++;

        if (
            data.count >
            MAX_REQUESTS
        ) {

            aiLocked = true;
            unlockTime =
                Date.now() + LOCK_TIME;

            console.log(
                "AI LOCKED"
            );

            await message.channel.send(
                "🔒 Hệ Thống AI đang tạm dừng để tránh lỗi hệ thống."
            );

            setTimeout(() => {

                aiLocked = false;

                console.log(
                    "AI UNLOCKED"
                );

            }, LOCK_TIME);

            return;

        }

        // =====================
        // AI CHAT
        // =====================

        try {

            console.log(
                `[GROQ] ${message.author.tag}: ${message.content}`
            );

            await message.channel.sendTyping();

            const response =
                await openai.chat.completions.create({
                    model:
                        "llama-3.1-8b-instant",
                    messages: [
                        {
                            role: "system",
                            content:
                                "Bạn là trợ lý AI thân thiện."
                        },
                        {
                            role: "user",
                            content:
                                message.content
                        }
                    ]
                });

            const reply =
                response.choices?.[0]
                ?.message?.content;

            if (!reply) {

                return message.reply(
                    "❌ AI không trả về nội dung."
                );

            }

            if (reply.length <= 2000) {

                return message.reply(
                    reply
                );

            }

            const fileName =
                `response-${Date.now()}.txt`;

            fs.writeFileSync(
                fileName,
                reply,
                "utf8"
            );

            await message.reply({
                content:
                    "📄 Nội dung quá dài, đã xuất thành file.",
                files: [
                    new AttachmentBuilder(
                        fileName
                    )
                ]
            });

            fs.unlinkSync(
                fileName
            );

        } catch (err) {

            console.error(
                "========== AI ERROR =========="
            );

            console.error(err);

            console.error(
                "================================"
            );

            return message.reply(
                `❌ Lỗi AI: ${err.message}`
            );

        }

    }
);

// =========================
// LOGIN
// =========================

client.login(
    process.env.DISCORD_TOKEN
);
