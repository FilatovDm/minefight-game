# Minefight

Пиксельный файтинг для платформы games.filatech.ru. Игроки управляют персонажами в воксельном стиле, сражаясь на арене.

## Часть платформы games.filatech.ru

- Архитектура платформы: https://github.com/FilatovDm/games-portal/blob/main/docs/architecture.md
- URL игры: games.filatech.ru/minefight/
- Деплой на сервере: /var/www/games.filatech.ru/games/minefight/
- GitHub: https://github.com/FilatovDm/minefight

## Технологии

- Чистый HTML/CSS/JS, без фреймворков и сборки
- Шаг сборки не требуется — файлы деплоятся как есть
- Точка входа: index.html

## Файловая структура

- `index.html` — точка входа, HTML-разметка игры
- `game.js` — вся логика игры 
- `style.css` — стили и анимации

## Стандарты платформы
- Обязательный UI: игра поддерживает кнопку паузы во время геймплея, а также кнопку возврата на витрину (games.filatech.ru) на экране паузы.

## Деплой

Копирование файлов на сервер Nunki (130.49.146.188):

```bash
rsync -avz --exclude='.git' --exclude='.DS_Store' \
  ./ root@130.49.146.188:/var/www/games.filatech.ru/games/minefight/
```
