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

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id VARCHAR(255) NOT NULL,
    receiver_id VARCHAR(255) NOT NULL,
    sender_team INT NOT NULL,
    receiver_team INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert admin user account
INSERT INTO users (id, name, passw, teams, score, quals_score, elim_score, position)
VALUES ('cf3a7c', 'Aidan', '$2b$10$98STPPBGziSjWbykHydP8ewk/41XXDM1HPo3.eJ2nf2CerJyRa9bK', '', 0, 0, 0, 0);
