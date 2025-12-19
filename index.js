const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
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

// --- СИСТЕМА УРОВНЕЙ (Счетчик) ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    let userData = await User.findOne({ userId: message.author.id });
    if (!userData) {
        userData = new User({ userId: message.author.id });
    }

    userData.messages += 1;

    const nextLevelThreshold = (userData.level + 1) * 10;

    if (userData.messages >= nextLevelThreshold) {
        userData.level += 1;
        userData.messages = 0; 

        const levelChannel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID);
        if (levelChannel) {
            const levelEmbed = new EmbedBuilder()
                .setTitle('🆙 НОВЫЙ УРОВЕНЬ!')
                .setDescription(`Поздравляем, ${message.author}! Твой новый уровень: **${userData.level}**!`)
                .setColor(0x00aaff)
                .setTimestamp();
            levelChannel.send({ embeds: [levelEmbed] });
        }
    }
    await userData.save();
});

// --- ОБРАБОТКА СЛЭШ-КОМАНД ---
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Команда /level
    if (commandName === 'level') {
        const userData = await User.findOne({ userId: interaction.user.id });
        
        const currentLevel = userData ? userData.level : 0;
        const currentMessages = userData ? userData.messages : 0;
        const nextLevelGoal = (currentLevel + 1) * 10;

        const levelEmbed = new EmbedBuilder()
            .setTitle(`📊 Статистика ${interaction.user.username}`)
            .setColor(0x00ffaa)
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
                { name: '⭐ Уровень', value: `${currentLevel}`, inline: true },
                { name: '✉️ Сообщения', value: `${currentMessages} / ${nextLevelGoal}`, inline: true },
                { name: '🚀 До следующего', value: `${nextLevelGoal - currentMessages} сообщ.`, inline: false }
            )
            .setFooter({ text: 'Пиши больше, чтобы поднять уровень!' });

        await interaction.reply({ embeds: [levelEmbed] });
    }

    // Команда /hi
    if (commandName === 'hi') {
        await interaction.reply(`Привет, ${interaction.user}! 👋`);
    }

    // Здесь можно добавить обработку других команд (kick, ban и т.д.)
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

client.login(BOT_TOKEN);
