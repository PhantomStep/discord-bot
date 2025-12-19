const { Client, Events, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

// --- КОНФИГУРАЦИЯ КАНАЛОВ ---
const TIMER_CHANNEL_ID = '1451183786115989648';
const WELCOME_CHANNEL_ID = '1451560569697075271';
const LEVEL_UP_CHANNEL_ID = '1451561184456347809';

// --- ПОДКЛЮЧЕНИЕ К БАЗЕ ---
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Подключено к MongoDB!'))
    .catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Создаем схему данных для пользователя
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    messages: { type: Number, default: 0 },
    level: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- ПРИВЕТСТВИЕ ---
client.on(Events.GuildMemberAdd, async (member) => {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    const welcomeEmbed = new EmbedBuilder()
        .setTitle(`👋 Добро пожаловать!`)
        .setDescription(`Привет, ${member}! Рады видеть тебя на сервере!`)
        .setColor(0x00ff00)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
    channel.send({ embeds: [welcomeEmbed] });
});

// --- СИСТЕМА УРОВНЕЙ ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    // Находим или создаем пользователя в базе
    let userData = await User.findOne({ userId: message.author.id });
    if (!userData) {
        userData = new User({ userId: message.author.id });
    }

    userData.messages += 1;

    // Формула: (Текущий уровень + 1) * 10
    const nextLevelThreshold = (userData.level + 1) * 10;

    if (userData.messages >= nextLevelThreshold) {
        userData.level += 1;
        userData.messages = 0; // Сброс счетчика для нового уровня

        const levelChannel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID);
        if (levelChannel) {
            const levelEmbed = new EmbedBuilder()
                .setTitle('🆙 НОВЫЙ УРОВЕНЬ!')
                .setDescription(`Поздравляем, ${message.author}! Твой новый уровень: **${userData.level}**!`)
                .setColor(0x00aaff);
            levelChannel.send({ embeds: [levelEmbed] });
        }
    }

    await userData.save(); // Сохраняем данные в базу
});

// --- ГОТОВНОСТЬ И ТАЙМЕР ---
client.once(Events.ClientReady, async c => {
    console.log(`Готов! Залогинен как ${c.user.tag}`);
    const channel = client.channels.cache.get(TIMER_CHANNEL_ID);
    if (channel) {
        let timeLeft = 15;
        const msg = await channel.send({ embeds: [new EmbedBuilder().setTitle('ОТКЛЮЧЕНИЕ ЧЕРЕЗ:').setDescription(`**${timeLeft} минут**`).setColor(0xffaa00)] });
        const inv = setInterval(async () => {
            timeLeft--;
            if (timeLeft <= 0) {
                await msg.edit({ embeds: [new EmbedBuilder().setTitle('ОТКЛЮЧЕНИЕ ЧЕРЕЗ:').setDescription('⌛ **Время вышло.**').setColor(0x2f3136)] });
                clearInterval(inv);
            } else {
                await msg.edit({ embeds: [new EmbedBuilder().setTitle('ОТКЛЮЧЕНИЕ ЧЕРЕЗ:').setDescription(`**${timeLeft} минут**`).setColor(0xffaa00)] });
            }
        }, 60000);
    }
});

// Твои остальные слэш-команды (kick, ban и т.д.) вставляй сюда ниже

client.login(BOT_TOKEN);
