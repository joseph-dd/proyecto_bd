CREATE TABLE boards (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(256) NOT NULL
);

CREATE TABLE users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    email VARCHAR(256) UNIQUE NOT NULL
);

CREATE TABLE board_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    isAdmin BOOLEAN DEFAULT false,
    boardId UUID REFERENCES boards(id) ON DELETE CASCADE ON UPDATE CASCADE,
    userId UUID REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE lists (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    boardId UUID REFERENCES boards(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE cards (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    listId UUID REFERENCES lists(id) ON DELETE CASCADE ON UPDATE CASCADE,
    description TEXT,
    dueDate DATE
);

CREATE TABLE card_users (
    userId UUID REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    cardId UUID REFERENCES cards(id) ON DELETE CASCADE ON UPDATE CASCADE,
    isOwner BOOLEAN DEFAULT false,
    PRIMARY KEY (userId, cardId)
);
