import pino from 'pino';

const logger = pino(pino.destination('snipe.log'));

export default logger;