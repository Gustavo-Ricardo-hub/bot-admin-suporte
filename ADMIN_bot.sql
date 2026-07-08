SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET NAMES utf8mb4;

-- =============================================
-- BANCO DE DADOS
-- =============================================
CREATE DATABASE IF NOT EXISTS `ADMIN_bot`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `ADMIN_bot`;

-- =============================================
-- TABELA: operadores
-- =============================================
CREATE TABLE IF NOT EXISTS `operadores` (
  `id`               int(11)      NOT NULL AUTO_INCREMENT,
  `nome`             varchar(100) NOT NULL,
  `numero_whatsapp`  varchar(30)  NOT NULL,
  `rf`               varchar(20)  DEFAULT NULL,
  `cargo`            varchar(50)  DEFAULT 'tecnico',
  `senha`            varchar(255) DEFAULT NULL,
  `ativo`            tinyint(1)   DEFAULT 1,
  `criado_em`        timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_whatsapp` (`numero_whatsapp`),
  UNIQUE KEY `rf` (`rf`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- =============================================
-- TABELA: usuarios
-- =============================================
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id`               int(11)      NOT NULL AUTO_INCREMENT,
  `numero_whatsapp`  varchar(30)  NOT NULL,
  `rf`               varchar(20)  NOT NULL,
  `nome`             varchar(100) NOT NULL,
  `setor`            varchar(100) NOT NULL,
  `data_cadastro`    timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_whatsapp` (`numero_whatsapp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- =============================================
-- TABELA: chamados
-- =============================================
CREATE TABLE IF NOT EXISTS `chamados` (
  `id`                  int(11)      NOT NULL AUTO_INCREMENT,
  `numero`              varchar(30)  DEFAULT NULL,
  `usuario`             varchar(30)  NOT NULL,
  `rf`                  varchar(20)  NOT NULL,
  `nome`                varchar(100) NOT NULL,
  `setor`               varchar(100) NOT NULL,
  `problema`            text         NOT NULL,
  `status`              varchar(20)  DEFAULT 'aberto',
  `tecnico_id`          int(11)      DEFAULT NULL,
  `tecnico_responsavel` varchar(100) DEFAULT NULL,
  `fechado_por`         int(11)      DEFAULT NULL,
  `mensagem_grupo_id`   varchar(255) DEFAULT NULL,
  `data_abertura`       datetime     NOT NULL,
  `data_fechamento`     datetime     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
  KEY `fk_tecnico`    (`tecnico_id`),
  KEY `fk_fechado_por`(`fechado_por`),
  CONSTRAINT `fk_tecnico`     FOREIGN KEY (`tecnico_id`)  REFERENCES `operadores` (`id`),
  CONSTRAINT `fk_fechado_por` FOREIGN KEY (`fechado_por`) REFERENCES `operadores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =============================================
-- TABELA: historico_status
-- =============================================
CREATE TABLE IF NOT EXISTS `historico_status` (
  `id`               int(11)     NOT NULL AUTO_INCREMENT,
  `chamado_id`       int(11)     NOT NULL,
  `status_anterior`  varchar(20) DEFAULT NULL,
  `novo_status`      varchar(20) DEFAULT NULL,
  `alterado_por`     int(11)     DEFAULT NULL,
  `data_alteracao`   timestamp   NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_historico_chamado`  (`chamado_id`),
  KEY `fk_historico_operador` (`alterado_por`),
  CONSTRAINT `fk_historico_chamado`  FOREIGN KEY (`chamado_id`)   REFERENCES `chamados`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_historico_operador` FOREIGN KEY (`alterado_por`) REFERENCES `operadores`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =============================================
-- TABELA: mensagens_chamado
-- =============================================
CREATE TABLE IF NOT EXISTS `mensagens_chamado` (
  `id`          int(11)      NOT NULL AUTO_INCREMENT,
  `chamado_id`  int(11)      NOT NULL,
  `remetente`   varchar(100) NOT NULL,
  `mensagem`    text         NOT NULL,
  `data_envio`  timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_chamado_mensagem` (`chamado_id`),
  CONSTRAINT `fk_chamado_mensagem` FOREIGN KEY (`chamado_id`) REFERENCES `chamados` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =============================================
-- TABELA: logs
-- =============================================
CREATE TABLE IF NOT EXISTS `logs` (
  `id`           int(11)   NOT NULL AUTO_INCREMENT,
  `operador_id`  int(11)   DEFAULT NULL,
  `acao`         text      NOT NULL,
  `data_log`     timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_log_operador` (`operador_id`),
  CONSTRAINT `fk_log_operador` FOREIGN KEY (`operador_id`) REFERENCES `operadores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;