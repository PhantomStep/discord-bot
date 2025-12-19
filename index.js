const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Константы каналов
const CHANNELS = {
    TIMER: '1451183786115989648',
    WELCOME: '1451560569697075271',
    LEVELS: '1451561184456347809'
};

// Схема MongoDB
const userSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Подключение к БД
mongoose.connect(process.env.MONGODB_URI).then(() => console.log('MongoDB connected'));

client.once('ready', async () => {
    console.log(`Бот запущен как ${client.user.tag}`);
    startShutdownTimer();
});

// Таймер отключения
async function startShutdownTimer() {
    const channel = await client.channels.fetch(CHANNELS.TIMER);
    if (!channel) return;

    let minutes = 15;
    const msg = await channel.send(`⏳ **ОТКЛЮЧЕНИЕ ЧЕРЕЗ:** ${minutes} минут`);

    const interval = setInterval(async () => {
        minutes--;
        if (minutes <= 0) {
            await msg.edit('🔴 **ОТКЛЮЧЕНО**');
            clearInterval(interval);
        } else {
            await msg.edit(`⏳ **ОТКЛЮЧЕНИЕ ЧЕРЕЗ:** ${minutes} минут`);
        }
    }, 60000);
}

// Приветствие
client.on('guildMemberAdd', member => {
    const welcomeChannel = member.guild.channels.cache.get(CHANNELS.WELCOME);
    if (!welcomeChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('Добро пожаловать!')
        .setDescription(`Привет, ${member}! Рады видеть тебя на сервере.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor('Green');

    welcomeChannel.send({ embeds: [embed] });
});

// Система уровней
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    let userData = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
    if (!userData) {
        userData = new User({ userId: message.author.id, guildId: message.guild.id });
    }

    userData.xp += 1;
    const nextLevelXp = (userData.level + 1) * 10;

    if (userData.xp >= nextLevelXp) {
        userData.level += 1;
        userData.xp = 0;
        
        const levelChannel = message.guild.channels.cache.get(CHANNELS.LEVELS);
        if (levelChannel) {
            const lvlEmbed = new EmbedBuilder()
                .setTitle('Повышение уровня!')
                .setDescription(`Поздравляем, ${message.author}! Твой новый уровень: **${userData.level}**`)
                .setColor('Gold');
            levelChannel.send({ embeds: [lvlEmbed] });
        }
    }
    await userData.save();
});

// Обработка команд
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;

    if (commandName === 'hi') {
        return interaction.reply('Привет!');
    }

    if (commandName === 'level') {
        await interaction.deferReply();
        const data = await User.findOne({ userId: member.id, guildId: guild.id });
        const level = data ? data.level : 0;
        const xp = data ? data.xp : 0;
        const next = (level + 1) * 10;
        return interaction.editReply(`Ваш уровень: **${level}** | Прогресс: **${xp}/${next}** сообщений.`);
    }

    // Модерация
    const target = options.getMember('target');
    const reason = options.getString('reason') || 'Не указана';

    try {
        if (commandName === 'kick') {
            await target.kick(reason);
            await interaction.reply(`Пользователь ${target.user.tag} исключен.`);
        } 
        
        else if (commandName === 'ban') {
            await target.ban({ reason });
            await interaction.reply(`Пользователь ${target.user.tag} забанен.`);
        }

        else if (commandName === 'unban') {
            const id = options.getString('id');
            await guild.members.unban(id);
            await interaction.reply(`Пользователь с ID ${id} разбанен.`);
        }

        else if (commandName === 'mute') {
            await target.timeout(28 * 24 * 60 * 60 * 1000, reason);
            await interaction.reply(`Мут на 28 дней выдан ${target.user.tag}.`);
        }

        else if (commandName === 'tmute') {
            const durationStr = options.getString('duration');
            const time = ms(durationStr);
            if (!time) return interaction.reply({ content: 'Неверный формат времени!', ephemeral: true });
            
            await target.timeout(time, reason);
            await interaction.reply(`Мут на ${durationStr} выдан ${target.user.tag}.`);
        }

        else if (commandName === 'unmute') {
            await target.timeout(null);
            await interaction.reply(`С пользователя ${target.user.tag} сняты ограничения.`);
        }

    } catch (err) {
        console.error(err);
        if (!interaction.replied) interaction.reply({ content: 'Ошибка при выполнении команды!', ephemeral: true });
    }
});

// Для работы на Render (Keep-alive)
const http = require('http');
http.createServer((req, res) => res.end('Бот активен')).listen(process.env.PORT || 3000);

client.login(process.env.BOT_TOKEN);
