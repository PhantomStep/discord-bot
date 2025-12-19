const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const commands = [
    {
        name: 'help',
        description: 'Показывает список всех доступных команд.',
    },
    {
        name: 'hi',
        description: 'Отвечает "Привет!"',
    },
    {
        name: 'level', // НАША НОВАЯ КОМАНДА
        description: 'Показать мой текущий уровень и прогресс.',
    },
    {
        name: 'clear',
        description: 'Удаляет указанное количество сообщений (от 1 до 100).',
        options: [
            {
                name: 'количество',
                description: 'Число сообщений для удаления (максимум 100).',
                type: ApplicationCommandOptionType.Integer,
                required: true,
            },
        ],
    },
    {
        name: 'clearall',
        description: 'Удаляет все сообщения, которые возможно удалить (младше 14 дней).',
    },
    {
        name: 'kick',
        description: 'Исключает пользователя с сервера (кик).',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь, которого нужно исключить.',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
            {
                name: 'причина',
                description: 'Причина исключения.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'ban',
        description: 'Перманентно банит пользователя.',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь, которого нужно забанить.',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
            {
                name: 'причина',
                description: 'Причина бана.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'tmute',
        description: 'Временно ограничивает пользователя (таймаут) на заданное время (10m, 2h).',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь, которого нужно ограничить.',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
            {
                name: 'время',
                description: 'Длительность таймаута (например, 10m, 1h, 3d). Максимум 28 дней.',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'причина',
                description: 'Причина таймаута.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'mute',
        description: 'Мутит пользователя на максимальный срок (28 дней).',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь, которого нужно ограничить.',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
            {
                name: 'причина',
                description: 'Причина ограничения.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'unmute',
        description: 'Снимает таймаут с пользователя.',
        options: [
            {
                name: 'пользователь',
                description: 'Пользователь, с которого нужно снять таймаут.',
                type: ApplicationCommandOptionType.User,
                required: true,
            },
            {
                name: 'причина',
                description: 'Причина снятия таймаута.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
    {
        name: 'unban',
        description: 'Снимает перманентный бан с пользователя.',
        options: [
            {
                name: 'id_пользователя', 
                description: 'ID пользователя, которого нужно разбанить.',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'причина',
                description: 'Причина снятия бана.',
                type: ApplicationCommandOptionType.String,
                required: false,
            },
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log('Начало регистрации (/) команд на сервере.');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('Успешная регистрация (/) команд!');
    } catch (error) {
        console.error('Ошибка при регистрации команд:', error);
    }
})();
