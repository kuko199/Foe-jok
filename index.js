// imports
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');

// ENV variables
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;               // ID serveru
const CHANNEL_TIMER = process.env.CHANNEL_TIMER;     // kanál pro panel (časovač)
const CHANNEL_CB = process.env.CHANNEL_CB;           // kanál pro otevřené boje

if (!TOKEN || !GUILD_ID || !CHANNEL_TIMER || !CHANNEL_CB) {
    console.log("❌ Chybí environment proměnné! Nastav TOKEN, GUILD_ID, CHANNEL_TIMER a CHANNEL_CB.");
    process.exit(1);
}

// Discord client
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// uložené boje: čas -> pole hodnot
let cb_map = new Map();

// id zprávy panelu
let panelMessageId = null;

// ----------------------------------------------------------------------
// ✅ AUTO PANEL PŘI STARTU
// ----------------------------------------------------------------------
client.once('ready', async () => {
    console.log("✅ Bot je online, vytvářím autopanel...");

    const guild = client.guilds.cache.get(GUILD_ID);
    const channel = guild.channels.cache.get(CHANNEL_TIMER);

    if (!channel) {
        console.log("❌ Kanál časovač (CHANNEL_TIMER) nenalezen!");
        return;
    }

    try {
        // vytvoření panelu
        const msg = await channel.send("📘 **Panel inicializován… čekám na boje.**");
        panelMessageId = msg.id;

        console.log("✅ Panel vytvořen:", panelMessageId);
    } catch (err) {
        console.log("❌ Chyba při vytváření panelu:", err);
    }
});

// ----------------------------------------------------------------------
// ✅ MESSAGE LISTENER – boje a příkazy
// ----------------------------------------------------------------------
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // ruční přehled
    if (message.content === '!boje') {
        return message.channel.send(cbOverview());
    }

    // rozpoznání bojů podle času
    if (/^\d{1,2}:\d{2}\s+.+/.test(message.content.split("\n")[0])) {
        cbAddTimer(message);
        message.react('👍');
        updatePanel(message.guild);
    }
});

// ----------------------------------------------------------------------
// ✅ CRON – každou minutu update panelu + upozornění otevřeno
// ----------------------------------------------------------------------
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2,"0");
    const mm = now.getMinutes().toString().padStart(2,"0");
    const currentTime = `${hh}:${mm}`;

    const guild = client.guilds.cache.get(GUILD_ID);
    const channel_cb = guild.channels.cache.get(CHANNEL_CB);

    // 🔴 otevření sektoru
    if (cb_map.has(currentTime)) {
        if (channel_cb) {
            channel_cb.send(cb_map.get(currentTime).join(" | ") + " **otevřeno**");
        }
        cb_map.delete(currentTime);
    }

    updatePanel(guild);
});

// ----------------------------------------------------------------------
// ✅ UPDATE PANELU
// ----------------------------------------------------------------------
async function updatePanel(guild) {
    if (!panelMessageId) return;

    const channel = guild.channels.cache.get(CHANNEL_TIMER);
    if (!channel) return;

    try {
        const msg = await channel.messages.fetch(panelMessageId).catch(() => null);
        if (!msg) return;

        await msg.edit(cbOverview());
    } catch (e) {
        console.log("❌ Panel update failed:", e);
    }
}

// ----------------------------------------------------------------------
// ✅ FUNKCE
// ----------------------------------------------------------------------
function cbAddTimer(message) {
    message.content.split(/\r?\n/).forEach(line => {
        const parts = line.trim().split(/\s+/);

        const time = parts[0];
        const emoji = parts[1];
        const sector = parts[2];

        if (!time || !sector) return;

        const entry = `${emoji} ${sector}`;

        if (cb_map.has(time)) cb_map.get(time).push(entry);
        else cb_map.set(time, [entry]);
    });
}

function minutesUntil(time) {
    const [hh, mm] = time.split(":").map(Number);
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
    return Math.round((target - now) / 60000);
}

function cbOverview() {
    if (cb_map.size === 0)
        return "📭 **Nemám uložené boje. Pošli je sem ve formátu:**\n```\n18:07 🔵 E5A\n```";

    let out = "🟦 **CB BOJE – ODPOČET**\n";

    cb_map.forEach((entries, time) => {
        const diff = minutesUntil(time);
        const label = diff >= 0 ? `za ${diff} min` : `${Math.abs(diff)} min po`;

        out += `\n**${time}** – ${entries.join(", ")}  \`${label}\``;
    });

    return out;
}

// login
client.login(TOKEN);
