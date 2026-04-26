-- Migration 00059: Tabela de Comentários e Comunicação entre Agentes

-- Tabela de comentários nas tarefas
CREATE TABLE comentarios_tarefa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_da_organizacao UUID NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
    id_da_tarefa UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    id_do_autor UUID REFERENCES agentes_config(id) ON DELETE SET NULL,
    autor_humano VARCHAR(100),
    conteudo TEXT NOT NULL,
    mencoes TEXT[],
    tipo VARCHAR(20) NOT NULL DEFAULT 'nota',
    lido_por TEXT[],
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comentarios_tarefa ON comentarios_tarefa(id_da_tarefa);
CREATE INDEX idx_comentarios_mencoes ON comentarios_tarefa USING gin(mencoes);
CREATE INDEX idx_comentarios_autor ON comentarios_tarefa(id_do_autor);

COMMENT ON TABLE comentarios_tarefa IS
'Canal de comunicação do esquadrão. Agentes se mencionam aqui para passar trabalho adiante.';

-- Tabela de notificações pendentes
CREATE TABLE notificacoes_agente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_do_agente UUID NOT NULL REFERENCES agentes_config(id) ON DELETE CASCADE,
    id_do_comentario UUID NOT NULL REFERENCES comentarios_tarefa(id) ON DELETE CASCADE,
    id_da_tarefa UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
    entregue BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    entregue_em TIMESTAMPTZ
);

CREATE INDEX idx_notificacoes_agente ON notificacoes_agente(id_do_agente, entregue);

COMMENT ON TABLE notificacoes_agente IS
'Fila de notificações para agentes. Gerada quando são mencionados em comentários.';

-- Função que gera notificações automaticamente ao inserir comentário
CREATE OR REPLACE FUNCTION gerar_notificacoes_mencoes()
RETURNS TRIGGER AS $$
DECLARE
    agente_id UUID;
    session_key TEXT;
BEGIN
    IF NEW.mencoes IS NOT NULL AND array_length(NEW.mencoes, 1) > 0 THEN
        FOR session_key IN SELECT unnest(NEW.mencoes)
        LOOP
            SELECT id INTO agente_id
            FROM agentes_config
            WHERE nome ILIKE '%' || session_key || '%'
               OR papel ILIKE '%' || session_key || '%'
            LIMIT 1;

            IF agente_id IS NOT NULL AND agente_id != NEW.id_do_autor THEN
                INSERT INTO notificacoes_agente
                    (id_do_agente, id_do_comentario, id_da_tarefa)
                VALUES
                    (agente_id, NEW.id, NEW.id_da_tarefa);
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notificacoes_mencoes
    AFTER INSERT ON comentarios_tarefa
    FOR EACH ROW
    EXECUTE FUNCTION gerar_notificacoes_mencoes();
