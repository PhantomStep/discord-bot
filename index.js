const { Client, Events, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

// --- КОНФИГУРАЦИЯ БОТА ---
const LOG_CHANNEL_NAME = 'logs'; // Имя вашего канала для логов
const MAX_MUTE_DURATION_MS = 28 * 24 * 60 * 60 * 1000; // 28 дней

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

// --- ЛОГИРОВАНИЕ: НОВАЯ ФУНКЦИЯ ---
async function logAction(guild, actionType, target, moderator, reason, duration) {
    try {
        const logChannel = guild.channels.cache.find(
            channel => channel.name === LOG_CHANNEL_NAME && channel.type === ChannelType.GuildText
        );

        if (!logChannel) {
            console.warn(`Канал логов #${LOG_CHANNEL_NAME} не найден.`);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🛡️ ${actionType}`)
            .setColor(0xff0000)
            .setTimestamp()
            .addFields(
                { name: 'Пользователь', value: target ? `${target.tag} (${target.id})` : 'ID не указан', inline: false },
                { name: 'Модератор', value: moderator.tag, inline: true },
                { name: 'Причина', value: reason || 'Не указана', inline: true }
            );
        
        if (duration) {
             embed.addFields({ name: 'Длительность', value: duration, inline: true });
        }
        
        if (actionType === 'UNBAN' || actionType === 'UNMUTE') {
             embed.setColor(0x00ff00);
        }

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

// Событие: Бот готов
client.once(Events.ClientReady, c => {
    console.log(`Готов! Залогинен как ${c.user.tag}`);
});

// --- ЛОГИКА АНТИ-СПАМА ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.member) return;

    const member = message.member;

    if (member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return; 
    }
    
    const userId = message.author.id;
    const now = Date.now();

    if (!activeSpamUsers.has(userId)) {
        activeSpamUsers.set(userId, []);
    }

    const timestamps = activeSpamUsers.get(userId);
    timestamps.push(now);

    const recentMessages = timestamps.filter(time => now - time < SPAM_TIME_WINDOW);
    activeSpamUsers.set(userId, recentMessages);
    
    if (recentMessages.length > SPAM_THRESHOLD) {
        if (!member.isCommunicationDisabled() && member.manageable) {
            try {
                await member.timeout(MUTE_DURATION, 'Автоматический мут за спам (30 минут)');
                console.log(`[ANTI-SPAM] Пользователь ${member.user.tag} замьючен на 30 минут.`);
                
                await message.channel.send(`**${member.user.tag}** получил(а) таймаут на 30 минут за спам.`);
                
                // ЛОГ АНТИ-СПАМА
                logAction(message.guild, 'АВТО-МУТ (СПАМ)', member.user, client.user, 'Автоматический мут за спам', '30 минут');

            } catch (error) {
                console.error(`Ошибка при применении таймаута к ${member.user.tag}:`, error);
                await message.channel.send(`Я не смог применить мут к ${member.user.tag}. Проверьте мои разрешения.`);
            }
        }
        
        activeSpamUsers.set(userId, []); 
    }
});


// --- Обработка слэш-команд ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const author = interaction.member;

    // Команды, требующие специальных прав
    const moderationCommands = ['kick', 'ban', 'tmute', 'mute', 'unmute', 'unban'];
    const bulkDeleteCommands = ['clear', 'clearall'];
    const isModerationCommand = moderationCommands.includes(commandName);
    const isDeleteCommand = bulkDeleteCommands.includes(commandName);

    if (commandName === 'hi') {
        await interaction.reply('Привет! Рад тебя видеть!');
        return;
    }
    
    // --- ГЛАВНАЯ ПРОВЕРКА РАЗРЕШЕНИЙ ---
    const requiredPermissions = [
        PermissionsBitField.Flags.Administrator, 
        PermissionsBitField.Flags.BanMembers,
    ];
    
    if (isModerationCommand) {
        const hasRequiredPermissions = requiredPermissions.some(permission => author.permissions.has(permission));
        if (!hasRequiredPermissions) {
            return interaction.reply({ 
                content: 'У вас нет необходимых прав Администратора или прав на бан/кик для использования этой команды.', 
                ephemeral: true 
            });
        }
    }
    
    // Проверка для команд очистки
    if (isDeleteCommand && !author.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({ 
            content: 'У вас нет права "Управлять сообщениями" для использования этой команды.', 
            ephemeral: true 
        });
    }
    // --- КОНЕЦ ГЛАВНОЙ ПРОВЕРКИ ---


    const targetUser = interaction.options.getMember('пользователь'); 
    const reason = interaction.options.getString('причина') || 'Причина не указана.';


    // --- Общие проверки целевого пользователя (для всех, кроме unban, clear, clearall, help) ---
    if (isModerationCommand && commandName !== 'unban') {
        if (!targetUser) {
            return interaction.reply({ content: 'Пользователь не найден на сервере.', ephemeral: true });
        }
        if (!targetUser.manageable) {
            return interaction.reply({
                content: `Я не могу применить модерацию к пользователю ${targetUser.user.tag}, так как его роль выше или равна моей.`,
                ephemeral: true
            });
        }
        if (targetUser.id === author.id) {
             return interaction.reply({
                content: `Нельзя применить команду модерации к самому себе.`,
                ephemeral: true
            });
        }
    }
    // --- Конец общих проверок ---

    switch (commandName) {
        
        case 'help':
            const helpEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('Список команд модерации')
                .setDescription('Для использования команд модерации требуются соответствующие права.')
                .addFields(
                    { name: '**/hi**', value: 'Отвечает "Привет!".', inline: true },
                    { name: '**/clear <кол-во>**', value: 'Удаляет до 100 сообщений.', inline: true },
                    { name: '**/clearall**', value: 'Удаляет все сообщения, которые возможно (за 14 дней).', inline: true },
                    { name: '**/mute, /unmute, /tmute**', value: 'Управление таймаутами (мутами).', inline: true },
                    { name: '**/kick, /ban, /unban**', value: 'Управление киками и банами.', inline: true },
                )
                .setFooter({ text: 'Используйте /help для полной информации.' });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
            break;
            
        // --- НОВАЯ КОМАНДА: CLEAR ---
        case 'clear':
            const amount = interaction.options.getInteger('количество');
            
            if (amount < 1 || amount > 100) {
                return interaction.reply({ content: 'Количество должно быть от 1 до 100.', ephemeral: true });
            }
            
            try {
                // Удаление +1, чтобы удалить само сообщение с командой
                const fetched = await interaction.channel.messages.fetch({ limit: amount + 1 });
                const deletedMessages = await interaction.channel.bulkDelete(fetched, true);

                await interaction.reply({ 
                    content: `Удалено ${deletedMessages.size} сообщений.`, 
                    ephemeral: true 
                });
                
                // ЛОГ
                logAction(interaction.guild, 'ОЧИСТКА ЧАТА', null, author.user, `Удалено ${deletedMessages.size} сообщений.`, interaction.channel.name);
                
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при очистке чата. Убедитесь, что у меня есть право "Управление сообщениями".', ephemeral: true });
            }
            break;
            
        // --- НОВАЯ КОМАНДА: CLEARALL ---
        case 'clearall':
            await interaction.deferReply({ ephemeral: true }); // Ждем выполнения долгой операции
            let deletedCount = 0;
            let lastId;
            let totalDeleted = 0;

            try {
                while (true) {
                    // Берем по 100 сообщений, не старше 14 дней
                    const fetched = await interaction.channel.messages.fetch({ limit: 100, before: lastId });
                    
                    if (fetched.size === 0) break;
                    
                    const messagesToDelete = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
                    
                    if (messagesToDelete.size === 0) break;

                    const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
                    deletedCount = deleted.size;
                    totalDeleted += deletedCount;

                    if (deletedCount < messagesToDelete.size) break; 
                    
                    lastId = fetched.last().id;
                }

                await interaction.editReply(`Удалено ${totalDeleted} сообщений (в пределах лимита 14 дней).`);
                
                // ЛОГ
                logAction(interaction.guild, 'ПОЛНАЯ ОЧИСТКА ЧАТА', null, author.user, `Удалено ${totalDeleted} сообщений.`, interaction.channel.name);

            } catch (error) {
                console.error(error);
                await interaction.editReply('Произошла ошибка при очистке чата. Возможно, есть очень старые сообщения.');
            }
            break;


        case 'kick':
            try {
                await targetUser.kick(reason);
                await interaction.reply(`Пользователь ${targetUser.user.tag} исключен (кик). Причина: **${reason}**`);
                logAction(interaction.guild, 'KICK', targetUser.user, author.user, reason);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при попытке кикнуть пользователя.', ephemeral: true });
            }
            break;

        case 'ban':
            try {
                await targetUser.ban({ reason: reason });
                await interaction.reply(`Пользователь ${targetUser.user.tag} забанен перманентно. Причина: **${reason}**`);
                logAction(interaction.guild, 'BAN', targetUser.user, author.user, reason);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при попытке забанить пользователя.', ephemeral: true });
            }
            break;

        case 'tmute':
            try {
                const durationString = interaction.options.getString('время');
                const durationMs = parseDuration(durationString);
                
                if (!durationMs || durationMs > MAX_MUTE_DURATION_MS) { 
                    return interaction.reply({ 
                        content: 'Неверный формат времени. Максимальный таймаут — 28 дней.', 
                        ephemeral: true 
                    });
                }

                await targetUser.timeout(durationMs, reason);
                await interaction.reply(`Пользователь ${targetUser.user.tag} получил таймаут на **${durationString}**. Причина: **${reason}**`);
                logAction(interaction.guild, 'TMUTE', targetUser.user, author.user, reason, durationString);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при попытке выдать таймаут.', ephemeral: true });
            }
            break;
            
        case 'mute':
            try {
                await targetUser.timeout(MAX_MUTE_DURATION_MS, reason); 
                await interaction.reply(`Пользователь ${targetUser.user.tag} замьючен на **28 дней** (максимальный срок). Причина: **${reason}**`);
                logAction(interaction.guild, 'MUTE', targetUser.user, author.user, reason, '28 дней');
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при попытке выдать мут.', ephemeral: true });
            }
            break;

        case 'unmute':
            try {
                if (!targetUser.isCommunicationDisabled()) {
                    return interaction.reply({ 
                        content: `Пользователь ${targetUser.user.tag} не находится в таймауте.`, 
                        ephemeral: true 
                    });
                }
                
                await targetUser.timeout(null, reason); 
                
                await interaction.reply(`С пользователя ${targetUser.user.tag} снят таймаут. Причина: **${reason}**`);
                logAction(interaction.guild, 'UNMUTE', targetUser.user, author.user, reason);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при попытке снять таймаут.', ephemeral: true });
            }
            break;

        case 'unban':
            const userId = interaction.options.getString('id_пользователя');
            try {
                const bans = await interaction.guild.bans.fetch();
                const bannedUser = bans.get(userId);

                if (!bannedUser) {
                    return interaction.reply({ content: `Пользователь с ID ${userId} не найден в списке забаненных.`, ephemeral: true });
                }

                await interaction.guild.bans.remove(userId, reason);
                await interaction.reply(`Пользователь с ID ${userId} (${bannedUser.user.tag}) был разбанен. Причина: **${reason}**`);
                logAction(interaction.guild, 'UNBAN', bannedUser.user, author.user, reason);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Произошла ошибка при попытке разбанить пользователя.', ephemeral: true });
            }
            break;
    }
});

// Авторизация бота
client.login(BOT_TOKEN);