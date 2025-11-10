// imports
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');

// ENV variables
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_TIMER = process.env.CHANNEL_TIMER;
const CHANNEL_CB = process.env.CHANNEL_CB;

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

// uložené boje – UKLÁDÁME V UTC!
let cb_map = new Map();

// id zprávy s panelem
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

    // ✅ nový příkaz pro smazání bojů
    if (message.content === '!reset') {
        cb_map.clear();
        message.channel.send("✅ Boje byly vymazány.");
        updatePanel(message.guild);
        return;
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

    // ✅ vytvoření aktuálního UTC času
    const hh = now.getUTCHours().toString().padStart(2, "0");
    const mm = now.getUTCMinutes().toString().padStart(2, "0");
    const currentUTC = `${hh}:${mm}`;

    const guild = client.guilds.cache.get(GUILD_ID);
    const channel_cb = guild.channels.cache.get(CHANNEL_CB);

    // 🔴 otevření sektoru
    if (cb_map.has(currentUTC)) {
        if (channel_cb) {
            channel_cb.send(cb_map.get(currentUTC).join(" | ") + " **otevřeno**");
        }
        cb_map.delete(currentUTC);
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

        const timeLocal = parts[0];   // čas, jak ho poslal hráč (CET/CEST)
        const emoji = parts[1];
        const sector = parts[2];

        if (!timeLocal || !sector) return;

        const utcTime = convertToUTC(timeLocal);
        const entry = `${emoji} ${sector}`;

        if (cb_map.has(utcTime)) cb_map.get(utcTime).push(entry);
        else cb_map.set(utcTime, [entry]);
    });
}

// ✅ VÝPOČET DO UTC
function convertToUTC(localTime) {
    let [hh, mm] = localTime.split(":").map(Number);

    // CET/CEST → UTC (minus 1 hodina)
    hh = (hh - 1 + 24) % 24;

    return `${hh.toString().padStart(2,"0")}:${mm.toString().padStart(2,"0")}`;
}

// ✅ rozdíl v minutách (aktuální čas → původní lokální čas)
function minutesUntil(timeLocal) {
    const [hh, mm] = timeLocal.split(":").map(Number);

    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);

    return Math.round((target - now) / 60000);
}

// ✅ PANEL
function cbOverview() {
    if (cb_map.size === 0)
        return "📭 **Nemám uložené boje. Pošli je sem ve formátu:**\n```\n18:07 🔵 E5A\n```";

    let out = "🟦 **CB BOJE – ODPOČET**\n";

    cb_map.forEach((entries, utcTime) => {

        // přepočítáme UTC zpět na lokální (kvůli zobrazení)
        let [h, m] = utcTime.split(":").map(Number);
        let localH = (h + 1) % 24;
        const localTime = `${localH.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`;

        const diff = minutesUntil(localTime);
        const label = diff >= 0 ? `za ${diff} min` : `${Math.abs(diff)} min po`;

        out += `\n**${localTime}** – ${entries.join(", ")}  \`${label}\``;
    });

    return out;
}

// login
client.login(TOKEN);
