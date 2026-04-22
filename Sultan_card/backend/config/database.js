const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = 'mongodb://localhost:27017/durak_game';
        
        console.log('🔄 Подключение к MongoDB...');
        
        // Убираем устаревшие опции
        await mongoose.connect(mongoURI);
        
        console.log('✅ MongoDB подключена успешно');
        console.log(`📦 База данных: ${mongoose.connection.name}`);
        console.log(`📍 Адрес: ${mongoURI}`);
        
    } catch (error) {
        console.error('❌ Ошибка подключения к MongoDB:', error.message);
        console.log('\n⚠️ Убедитесь, что MongoDB запущена в отдельном окне:');
        console.log('mongod --dbpath D:\\MongoDB\\data\\db');
        console.log('⚠️ Продолжаем работу без MongoDB (данные будут храниться временно)');
    }
};

module.exports = connectDB;