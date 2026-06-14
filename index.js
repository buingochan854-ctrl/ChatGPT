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
// WEB SERVER (RENDER)
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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
console.log(
    "OPENAI_API_KEY:",
    process.env.OPENAI_API_KEY
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
const lockedChannels = new Map();

const MAX_REQUESTS = 15;
const WINDOW_TIME = 60000;
const LOCK_TIME = 60000;

// =========================
// READY
// =========================

client.once("clientReady", () => {

    console.log(
        `${client.user.tag} Online`
    );

    client.user.setActivity(
        "🤖 ChatGPT AI"
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
        // CHANNEL LOCK
        // =====================

        if (
            lockedChannels.has(
                message.channel.id
            )
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

            lockedChannels.set(
                message.channel.id,
                true
            );

            await message.channel.send(
                "🔒 Tạm Thời Khóa Kênh Để Tránh Quá Tải. Sẽ Mở Lại Sau 1 Phút Nữa."
            );

            setTimeout(
                async () => {

                    lockedChannels.delete(
                        message.channel.id
                    );

                    try {

                        await message.channel.send(
                            "🔓 Kênh đã được mở lại."
                        );

                    } catch {}

                },
                LOCK_TIME
            );

            return;
        }

        // =====================
        // AI CHAT
        // =====================

        try {

            console.log(
                `[GPT] ${message.author.tag}: ${message.content}`
            );

            await message.channel.sendTyping();

            const response =
                await openai.chat.completions.create({
                    model: "gpt-4o-mini",
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
                response?.choices?.[0]?.message?.content;

            if (!reply) {

                console.log(
                    "[GPT] Không nhận được phản hồi."
                );

                return message.reply(
                    "❌ AI không trả về nội dung."
                );

            }

            // Trả lời ngắn
            if (reply.length <= 2000) {

                return message.reply(reply);

            }

            // Trả lời dài -> xuất file txt
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
                    new AttachmentBuilder(fileName)
                ]
            });

            fs.unlinkSync(fileName);

       } catch (err) {

            console.error(
                "========== GPT ERROR =========="
            );

            console.error(err);

            console.error(
                "================================"
            );

            return message.reply(
                `❌ Lỗi GPT: ${err.message}`
            );

        }

});

client.login(process.env.DISCORD_TOKEN)
;
 
