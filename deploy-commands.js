const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder().setName('hi').setDescription('Поздороваться с ботом'),
    new SlashCommandBuilder().setName('level').setDescription('Показать ваш уровень и прогресс'),
    
    // Модерация
    new SlashCommandBuilder().setName('kick').setDescription('Исключить пользователя')
        .addUserOption(opt => opt.setName('target').setDescription('Кого исключить').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Причина'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder().setName('ban').setDescription('Забанить пользователя')
        .addUserOption(opt => opt.setName('target').setDescription('Кого забанить').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Причина'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder().setName('unban').setDescription('Разбанить пользователя по ID')
        .addStringOption(opt => opt.setName('id').setDescription('ID пользователя').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder().setName('mute').setDescription('Мут на 28 дней')
        .addUserOption(opt => opt.setName('target').setDescription('Кому выдать мут').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Причина'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder().setName('tmute').setDescription('Мут на время')
        .addUserOption(opt => opt.setName('target').setDescription('Кому выдать мут').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Время (10m, 1h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Причина'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder().setName('unmute').setDescription('Снять мут')
        .addUserOption(opt => opt.setName('target').setDescription('С кого снять мут').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Начинаю обновление слеш-команд...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('Команды успешно зарегистрированы!');
    } catch (error) {
        console.error(error);
    }
})();
