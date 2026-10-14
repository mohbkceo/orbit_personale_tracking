import { createContext, useContext } from 'react';

export const TelegramContext = createContext(null);
export const useTelegram = () => useContext(TelegramContext);
