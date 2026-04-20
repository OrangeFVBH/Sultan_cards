// Файл для управления регистрацией и авторизацией
// Этот файл должен быть в frontend/js/auth.js

const users = new Map(); // Временное хранилище (в реальном проекте - БД)

function registerUser() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm').value;
    
    if (!username || !password) {
        showMessage('Заполните все поля', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Пароли не совпадают', 'error');
        return;
    }
    
    if (password.length < 3) {
        showMessage('Пароль должен быть не менее 3 символов', 'error');
        return;
    }
    
    if (users.has(username)) {
        showMessage('Пользователь уже существует', 'error');
        return;
    }
    
    // Простое хеширование (в реальном проекте используйте bcrypt)
    const hash = btoa(password);
    users.set(username, { password: hash, wins: 0, losses: 0 });
    
    showMessage('Регистрация успешна! Теперь войдите', 'success');
    setTimeout(() => {
        showLoginForm();
    }, 2000);
}

function loginUser() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showMessage('Заполните все поля', 'error');
        return;
    }
    
    const user = users.get(username);
    const hash = btoa(password);
    
    if (!user || user.password !== hash) {
        showMessage('Неверное имя пользователя или пароль', 'error');
        return;
    }
    
    // Сохраняем сессию
    sessionStorage.setItem('currentUser', username);
    showMessage('Вход выполнен!', 'success');
    
    setTimeout(() => {
        window.location.href = 'lobby.html';
    }, 1000);
}

function logout() {
    sessionStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

function checkAuth() {
    const currentUser = sessionStorage.getItem('currentUser');
    if (!currentUser && window.location.pathname !== '/index.html' && window.location.pathname !== '/register.html') {
        window.location.href = 'index.html';
    }
    return currentUser;
}

function showMessage(msg, type) {
    const msgDiv = document.getElementById('message');
    if (msgDiv) {
        msgDiv.textContent = msg;
        msgDiv.className = `message ${type}`;
        setTimeout(() => {
            msgDiv.textContent = '';
            msgDiv.className = 'message';
        }, 3000);
    }
}

function showLoginForm() {
    const container = document.getElementById('auth-container');
    if (container) {
        container.innerHTML = `
            <h2>Вход в игру</h2>
            <input type="text" id="login-username" placeholder="Ник" maxlength="12">
            <input type="password" id="login-password" placeholder="Пароль">
            <button onclick="loginUser()">Войти</button>
            <button onclick="showRegisterForm()" class="secondary">Регистрация</button>
        `;
    }
}

function showRegisterForm() {
    const container = document.getElementById('auth-container');
    if (container) {
        container.innerHTML = `
            <h2>Регистрация</h2>
            <input type="text" id="reg-username" placeholder="Ник" maxlength="12">
            <input type="password" id="reg-password" placeholder="Пароль">
            <input type="password" id="reg-confirm" placeholder="Подтвердите пароль">
            <button onclick="registerUser()">Зарегистрироваться</button>
            <button onclick="showLoginForm()" class="secondary">Уже есть аккаунт</button>
        `;
    }
}

// Экспортируем функции для глобального использования
window.registerUser = registerUser;
window.loginUser = loginUser;
window.logout = logout;
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;