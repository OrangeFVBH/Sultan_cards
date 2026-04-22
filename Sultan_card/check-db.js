const mongoose = require('mongoose');

async function checkDB() {
    try {
        console.log('🔄 Подключение к MongoDB...');
        await mongoose.connect('mongodb://localhost:27017/durak_game');
        
        const db = mongoose.connection.db;
        
        // Получаем список всех коллекций
        const collections = await db.listCollections().toArray();
        console.log('📊 Коллекции в базе:', collections.map(c => c.name));
        
        // Проверяем коллекцию users
        const users = db.collection('users');
        const userCount = await users.countDocuments();
        console.log(`\n👥 Количество пользователей: ${userCount}`);
        
        if (userCount > 0) {
            const allUsers = await users.find({}).toArray();
            console.log('\n📋 Список пользователей:');
            allUsers.forEach(user => {
                console.log(`  ✅ ${user.username}`);
                console.log(`     Побед: ${user.wins}, Поражений: ${user.losses}, Игр: ${user.gamesPlayed}`);
                console.log(`     Создан: ${user.createdAt}`);
                console.log('  ---');
            });
        } else {
            console.log('\n⚠️ Пользователей пока нет. Зарегистрируйтесь через сайт!');
        }
        
        await mongoose.disconnect();
        console.log('\n✅ Проверка завершена');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        console.log('\nУбедитесь, что MongoDB запущена:');
        console.log('mongod --dbpath D:\\MongoDB\\data\\db');
    }
}

checkDB();