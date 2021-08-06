import winston = require("winston");

const logger: winston.Logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.simple(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(info => `${info.message}`)
    ),
    transports: [
        new winston.transports.File({
            level: 'info',
            dirname: '/home/denis/Desktop',
            filename: 'encode-time.csv'
        }),
    ]
});

export  default logger;