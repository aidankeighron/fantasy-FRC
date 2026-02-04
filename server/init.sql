-- Initialize the fantasy database schema

CREATE DATABASE IF NOT EXISTS fantasy;
USE fantasy;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    passw VARCHAR(255) NOT NULL,
    teams TEXT,
    score INT DEFAULT 0,
    quals_score INT DEFAULT 0,
    elim_score INT DEFAULT 0,
    position INT DEFAULT 0
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    number INT NOT NULL UNIQUE,
    opr FLOAT DEFAULT 0,
    average FLOAT DEFAULT 0,
    score INT DEFAULT 0,
    location VARCHAR(255),
    owner VARCHAR(255)
);

-- Grant permissions and fix authentication plugin for legacy mysql driver
GRANT ALL PRIVILEGES ON fantasy.* TO 'root'@'%';
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'password';
FLUSH PRIVILEGES;

-- Insert admin user account
-- Username: Aidan, Password: mad77777 (hashed with bcrypt)
INSERT INTO users (id, name, passw, teams, score, quals_score, elim_score, position)
VALUES ('admin', 'Aidan', '$2b$10$hgbXyH7ob2FQjr1yBPNN9.vIny7yQRo0ON9Dl1L2rBG2DapZ5.oRi', '', 0, 0, 0, 0);
