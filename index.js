const { Client, Events, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

// --- КОНФИГУРАЦИЯ ТАЙМЕРА ---
const TIMER_CHANNEL_ID = '1451183786115989648'; // Замени на ID канала для таймера

// --- КОНФИГУРАЦИЯ БОТА ---
const LOG_CHANNEL_NAME = 'logs'; 
const MAX_MUTE_DURATION_MS = 28 * 24 * 60 * 60 * 1000; 

// --- КОНФИГУРАЦИЯ АНТИ-СПАМА ---
const SPAM_THRESHOLD = 5; 
const SPAM_TIME_WINDOW = 5000; 
const MUTE_DURATION = 30 * 60 * 1000; 
const activeSpamUsers = new Map(); 

// --- Вспомогательная функция для парсинга времени ---
function parseDuration(durationString) {
    const timeMatch = durationString.match(/(\d+)([smhdy])/);
    if (!timeMatch) return null;
    const [, amount, unit] = timeMatch;
    const num = parseInt(amount);
    switch (unit) {
        case 's': return num * 1000;
        case 'm': return num * 60 * 1000;
        case 'h': return num * 60 * 60 * 1000;
        case 'd': return num * 24 * 60 * 60 * 1000;
        case 'y': return 28 * 24 * 60 * 60 * 1000; 
        default: return null;
    }
}

// --- ЛОГИРОВАНИЕ ---
async function logAction(guild, actionType, target, moderator, reason, duration) {
    try {
        const logChannel = guild.channels.cache.find(
            channel => channel.name === LOG_CHANNEL_NAME && channel.type === ChannelType.GuildText
        );
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🛡️ ${actionType}`)
            .setColor(0xff0000)
            .setTimestamp()
            .addFields(
                { name: 'Пользователь', value: target ? `${target.tag} (${target.id})` : 'ID не указан', inline: false },
                { name: 'Модератор', value: moderator.tag, inline: true },
                { name: 'Причина', value: reason || 'Не указана', inline: true }
            );
        if (duration) embed.addFields({ name: 'Длительность', value: duration, inline: true });
        if (actionType === 'UNBAN' || actionType === 'UNMUTE') embed.setColor(0x00ff00);
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при логировании:', error);
    }
}

// --- СОЗДАНИЕ КЛИЕНТА ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.MessageContent 
    ] 
});

// Событие: Бот готов + ТАЙМЕР
client.once(Events.ClientReady, async c => {
    console.log(`Готов! Залогинен как ${c.user.tag}`);

    // Логика таймера
    const channel = client.channels.cache.get(TIMER_CHANNEL_ID);
    if (channel) {
        let timeLeft = 15;
        const timerEmbed = new EmbedBuilder()
            .setTitle('ОТКЛЮЧЕНИЕ БОТА ЧЕРЕЗ:')
            .setDescription(`**${timeLeft} минут**`)
            .setColor(0xffaa00)
            .setTimestamp();

        try {
            const message = await channel.send({ embeds: [timerEmbed] });

            const interval = setInterval(async () => {
                timeLeft--;
                if (timeLeft <= 0) {
                    const finalEmbed = new EmbedBuilder()
                        .setTitle('ОТКЛЮЧЕНИЕ БОТА ЧЕРЕЗ:')
                        .setDescription('⌛ **Время вышло. Ожидание завершения сессии Render...**')
                        .setColor(0x2f3136);
                    await message.edit({ embeds: [finalEmbed] });
                    clearInterval(interval);
                } else {
                    const updateEmbed = new EmbedBuilder()
                        .setTitle('ОТКЛЮЧЕНИЕ БОТА ЧЕРЕЗ:')
                        .setDescription(`**${timeLeft} минут**`)
                        .setColor(0xffaa00)
                        .setTimestamp();
                    await message.edit({ embeds: [updateEmbed] });
                }
            }, 60000);
        } catch (e) { console.error('Ошибка таймера:', e); }
    }
});

// --- ЛОГИКА АНТИ-СПАМА ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.member) return;
    const member = message.member;
    if (member.permissions.has(PermissionsBitField.Flags.KickMembers)) return; 
    
    const userId = message.author.id;
    const now = Date.now();
    if (!activeSpamUsers.has(userId)) activeSpamUsers.set(userId, []);
    const timestamps = activeSpamUsers.get(userId);
    timestamps.push(now);
    const recentMessages = timestamps.filter(time => now - time < SPAM_TIME_WINDOW);
    activeSpamUsers.set(userId, recentMessages);
    
    if (recentMessages.length > SPAM_THRESHOLD) {
        if (!member.isCommunicationDisabled() && member.manageable) {
            try {
                await member.timeout(MUTE_DURATION, 'Автоматический мут за спам');
                await message.channel.send(`**${member.user.tag}** получил(а) таймаут на 30 минут за спам.`);
                logAction(message.guild, 'АВТО-МУТ (СПАМ)', member.user, client.user, 'Автоматический мут за спам', '30 минут');
            } catch (error) { console.error(error); }
        }
        activeSpamUsers.set(userId, []); 
    }
});

// --- Обработка слэш-команд ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;
    const author = interaction.member;

    const moderationCommands = ['kick', 'ban', 'tmute', 'mute', 'unmute', 'unban'];
    const bulkDeleteCommands = ['clear', 'clearall'];
    const isModerationCommand = moderationCommands.includes(commandName);
    const isDeleteCommand = bulkDeleteCommands.includes(commandName);

    if (commandName === 'hi') return interaction.reply('Привет! Рад тебя видеть!');
    
    // Проверки прав
    const requiredPermissions = [PermissionsBitField.Flags.Administrator, PermissionsBitField.Flags.BanMembers];
    if (isModerationCommand) {
        if (!requiredPermissions.some(p => author.permissions.has(p))) {
            return interaction.reply({ content: 'У вас нет прав на использование этой команды.', ephemeral: true });
        }
    }
    if (isDeleteCommand && !author.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({ content: 'У вас нет прав на управление сообщениями.', ephemeral: true });
    }

    const targetUser = interaction.options.getMember('пользователь'); 
    const reason = interaction.options.getString('причина') || 'Причина не указана.';

    if (isModerationCommand && commandName !== 'unban') {
        if (!targetUser) return interaction.reply({ content: 'Пользователь не найден.', ephemeral: true });
        if (!targetUser.manageable || targetUser.id === author.id) {
            return interaction.reply({ content: 'Я не могу применить это к данному пользователю.', ephemeral: true });
        }
    }

    switch (commandName) {
        case 'help':
            const helpEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Команды модерации')
                .addFields(
                    { name: '**/clear**', value: 'Очистка сообщений', inline: true },
                    { name: '**/mute/ban/kick**', value: 'Наказания', inline: true }
                );
            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
            break;

        case 'clear':
            const amount = interaction.options.getInteger('количество');
            if (amount < 1 || amount > 100) return interaction.reply({ content: 'От 1 до 100.', ephemeral: true });
            const fetched = await interaction.channel.messages.fetch({ limit: amount });
            const deleted = await interaction.channel.bulkDelete(fetched, true);
            await interaction.reply({ content: `Удалено ${deleted.size} сообщений.`, ephemeral: true });
            logAction(interaction.guild, 'CLEAR', null, author.user, `Удалено ${deleted.size}`, interaction.channel.name);
            break;

        case 'kick':
            await targetUser.kick(reason);
            await interaction.reply(`Пользователь ${targetUser.user.tag} кикнут.`);
            logAction(interaction.guild, 'KICK', targetUser.user, author.user, reason);
            break;

        case 'ban':
            await targetUser.ban({ reason });
            await interaction.reply(`Пользователь ${targetUser.user.tag} забанен.`);
            logAction(interaction.guild, 'BAN', targetUser.user, author.user, reason);
            break;

        case 'tmute':
            const dStr = interaction.options.getString('время');
            const dMs = parseDuration(dStr);
            if (!dMs || dMs > MAX_MUTE_DURATION_MS) return interaction.reply({ content: 'Ошибка времени.', ephemeral: true });
            await targetUser.timeout(dMs, reason);
            await interaction.reply(`Таймаут для ${targetUser.user.tag} на ${dStr}.`);
            logAction(interaction.guild, 'TMUTE', targetUser.user, author.user, reason, dStr);
            break;

        case 'unmute':
            await targetUser.timeout(null, reason);
            await interaction.reply(`Таймаут снят с ${targetUser.user.tag}.`);
            logAction(interaction.guild, 'UNMUTE', targetUser.user, author.user, reason);
            break;

        case 'unban':
            const uid = interaction.options.getString('id_пользователя');
            await interaction.guild.bans.remove(uid, reason);
            await interaction.reply(`ID ${uid} разбанен.`);
            logAction(interaction.guild, 'UNBAN', { tag: uid, id: uid }, author.user, reason);
            break;
    }
});

client.login(BOT_TOKEN);
