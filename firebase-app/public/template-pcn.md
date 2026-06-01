# **PROCESSO: [INSERIR NOME DO PROCESSO]**

## **PARTE 1: ANÁLISE DE IMPACTO DE NEGÓCIOS (BIA)**

1. Identificação do Processo

* **Nome do Processo:** [Inserir o nome do processo macro/subprocesso]
* **Área Responsável:** [Inserir a área ou departamento responsável]
* **Dono do Processo:** [Inserir nome e cargo do gestor responsável]
* **Descrição Funcional:** [Descrever brevemente o objetivo principal e o funcionamento básico do processo]

2. Classificação de Criticidade

* [ ] **Tier 1 - Crítico:** Processos cuja interrupção causa impacto severo e imediato à operação, finanças ou reputação.
* [ ] **Tier 2 - Essencial:** Processos importantes, mas que toleram um período curto de indisponibilidade.
* [ ] **Tier 3 - Suporte:** Processos que dão apoio à operação e possuem baixo impacto imediato em caso de parada.

3. Matriz de Impacto da Indisponibilidade

| Dimensão do Impacto | Janela: 1 Hora | Janela: 4 Horas | Janela: 24 Horas |
| :---- | :---- | :---- | :---- |
| **Operacional** | [Descrever impactos nas rotinas internas] | [Descrever atrasos e acúmulo de trabalho] | [Descrever paralisações críticas e gargalos] |
| **Reputacional** | [Descrever impacto na percepção do cliente] | [Descrever reclamações e acionamentos] | [Descrever perda de confiança e riscos comerciais] |
| **Financeiro** | [Descrever atrasos pontuais de caixa/receita] | [Descrever perdas e impacto no fluxo de caixa] | [Descrever prejuízos graves e quebra de caixa] |
| **Legal / Regulatório** | [Descrever riscos contratuais ou fiscais imediatos] | [Descrever quebras de prazos regulatórios] | [Descrever riscos elevados de multas ou autuações] |

4. Mapeamento de Dependências Críticas

| Tipo de Dependência | Recursos Necessários para Continuidade |
| :---- | :---- |
| **Pessoas** | [Inserir equipes internas, analistas e técnicos vitais] |
| **Sistemas** | [Inserir softwares, ERPs, integrações e plataformas utilizadas] |
| **Fornecedores** | [Inserir parceiros externos, bancos, prestadores de serviços, links de internet] |
| **Infraestrutura** | [Inserir servidores, bancos de dados, redes, energia, estações de trabalho] |

5. Objetivos de Recuperação (RTO e RPO)

* **Recovery Time Objective (RTO):** Tempo máximo tolerável para o restabelecimento do recurso/serviço após a falha.
* **Recovery Point Objective (RPO):** Quantidade máxima aceitável de perda de dados medida em tempo.

| Recurso / Ativo Crítico | RTO Esperado | RPO Alvo (Mapeamento de Dados) |
| :---- | :---- | :---- |
| [Ex: Banco de Dados Principal] | < [X] Horas | Perda máxima aceitável: [Y] Horas |
| [Ex: Ambiente Cloud / Infra] | < [X] Horas | [N/A ou Especificar tempo] |

## **PARTE 2: PLANO DE CONTINUIDADE DE NEGÓCIOS (BCP)**

1. Escopo e Objetivo

* **Objetivo:** Garantir a continuidade operacional e a rápida recuperação do processo de [Inserir Nome do Processo], mitigando os impactos operacionais, financeiros, regulatórios e reputacionais em caso de disrupção.
* **Escopo:** Este plano abrange os seguintes sub-processos e atividades críticas:
  * [Atividade Crítica 1]
  * [Atividade Crítica 2]
  * [Infraestrutura e sistemas que suportam o escopo]

2. Informações de Contato e Matriz de Responsabilidade

| Nome | Papel na Crise | Setor / Organização | Telefone | E-mail |
| :---- | :---- | :---- | :---- | :---- |
| [Nome do Líder] | Coordenador do Plano / Dono do Processo | [Setor] | (XX) XXXXX-XXXX | [E-mail] |
| [Nome Técnico] | Recuperação de Sistemas e TI | TI | (XX) XXXXX-XXXX | [E-mail] |
| [Nome Fornecedor] | Suporte de Terceiros / Cloud | [Empresa Externa] | (XX) XXXXX-XXXX | [E-mail] |

3. Avaliação de Riscos (Risk Assessment)

| Evento / Ameaça Mapeada | Probabilidade | Impacto | Estratégia de Mitigação |
| :---- | :---- | :---- | :---- |
| [Ex: Indisponibilidade do Sistema Principal] | [Baixo/Médio/Alto] | [Baixo/Médio/Alto] | [Backup e recuperação prioritária] |
| [Ex: Falha em Integração de Terceiros] | [Baixo/Médio/Alto] | [Baixo/Médio/Alto] | [Acionamento de operação manual/contingencial] |
| [Ex: Queda de Conectividade / Internet] | [Baixo/Médio/Alto] | [Baixo/Médio/Alto] | [Uso de links redundantes/roteamento secundário] |

4. Medidas Preventivas (Controles Existentes)

| Controle Controlado | Descrição da Medida de Proteção / Redundância |
| :---- | :---- |
| **Backup** | [Rotina, frequência e validação de backups] |
| **Monitoramento** | [Alertas automáticos de indisponibilidade e telemetria] |
| **Redundância de Infra** | [Links secundários de internet, firewalls em HA, servidores replicados] |

5. Estratégia Operacional em Contingência

| Atividade ou Serviço Afetado | Estratégia de Contingência / Alternativa Operacional |
| :---- | :---- |
| [Serviço 1] | [Ex: Processamento manual via planilha, lote físico ou fluxo offline] |
| [Serviço 2] | [Ex: Priorização de atendimento para clientes críticos / contratos VIP] |
| [Comunicação] | [Ex: Utilização de canais ou servidores SMTP alternativos] |

6. Estrutura de Governança da Crise

| Papel / Comitê | Responsabilidade Atribuída na Crise |
| :---- | :---- |
| **Dono do Processo** | Aprovação executiva, tomada de decisões estratégicas e priorização operacional. |
| **Equipe Operacional** | Execução dos procedimentos manuais e controle de contingência. |
| **Tecnologia da Informação (TI)** | Investigação técnica, troubleshooting e recuperação de dados/sistemas. |
| **Segurança da Informação (SI)** | Monitoramento da conformidade e garantia da segurança em modo de crise. |

7. Critérios de Ativação do BCP

O Plano de Continuidade de Negócios será formalmente ativado sob as seguintes condições:

* Indisponibilidade do sistema [Nome do Sistema] superior a [X] minutos.
* Falha crítica generalizada que impeça [Atividade Principal] em larga escala.
* Risco eminente de estourar o RTO definido de [X] horas.
* Comprometimento severo do fluxo de [Entregável do Processo].

8. Fluxo Prioritário de Recuperação

| Ordem de Prioridade | Recurso / Ativo a ser Restaurado | RTO Alvo | RPO Alvo |
| :---- | :---- | :---- | :---- |
| **1** | [Recurso Mais Crítico - Ex: Banco de Dados] | < [X]h | [Y]h |
| **2** | [Infraestrutura / Servidor de Aplicação] | < [X]h | N/A |
| **3** | [Integrações / APIs de Terceiros] | < [X]h | [Sincronização] |

9. Plano de Comunicação da Crise

* **Comunicação Interna:** O Coordenador do Plano notificará a Diretoria e as áreas afetadas.
  * **Frequência de Atualização:** A cada [X] hora(s) enquanto durar a crise.
* **Comunicação Externa:** Clientes e parceiros serão avisados formalmente se houver atrasos.
* **Canais Homologados:** [E-mail corporativo, Chats internos, Telefone, Comunicados Oficiais].

10. Cronograma de Testes, Exercícios e Manutenção

| Atividade / Teste | Escopo do Exercício | Frequência Recomendada |
| :---- | :---- | :---- |
| **Mesa de Crise / Simulado** | Alinhamento de papéis e leitura do plano com os líderes | Semestral |
| **Teste de Contingência** | Simulação de falha e início da operação manual/planilhas | Semestral / Anual |
| **Revisão do Plano** | Atualização de contatos, fornecedores e escopo do BCP | Anual |

## **PARTE 3: PLANO DE RECUPERAÇÃO DE DESASTRES (DRP)**

1. Objetivo e Escopo Técnico

* **Objetivo:** Restabelecer a infraestrutura de TI, sistemas e conectividade que suportam o processo de [Nome do Processo] após desastres ou falhas severas.
* **Componentes Técnicos Cobertos:** [Servidores, Banco de Dados, APIs, Tokens, Certificados Digitais, DNS, Rede corporativa].

2. Estratégia Técnica de Recuperação

* **Modelo Adotado:** [Ex: Backup & Restore em Nuvem / Ambiente Standby / Hot Site]
* **SLA de Ativação:** O desastre operacional deve ser declarado em até [X] minutos após a confirmação da falha técnica crítica.

| Atributo Técnico da Estratégia | Definição / Padrão Adotado |
| :---- | :---- |
| **Ambiente de Destino** | [Mesma cloud / Provedor secundário / Data Center Físico] |
| **Failover Automático** | [Sim / Não] |
| **Provisionamento da Infra** | [Sob Demanda (IaC) / Infraestrutura Standby permanente] |

3. Checklists de Verificação e Diagnóstico (Health Check)

* [ ] **Infraestrutura / Cloud:** O ambiente/console está acessível?
* [ ] **Banco de Dados:** A integridade dos arquivos de backup está preservada?
* [ ] **Segurança e Acessos:** Os certificados e tokens mTLS/OAuth continuam válidos?
* [ ] **Rede e Conectividade:** Links de internet e resolução de DNS externos estão ativos?

4. Fase Executiva de Recuperação (Runbook de Restore)

1. **Reprovisionar/Validar a Infraestrutura:** Subir instâncias de máquinas virtuais, containers ou volumes de storage.
2. **Restaurar o Banco de Dados:** Aplicar o restore a partir do último backup íntegro.
3. **Subir a Aplicação:** Reinstalar ou reativar os serviços e códigos do sistema principal.
4. **Validar Conectividade e Segurança:** Aplicar regras de firewall, apontar DNS e reimportar certificados digitais.
5. **Restabelecer Integrações:** Revalidar tokens de autenticação e endpoints de APIs.
6. **Limpar e Processar Filas:** Reprocessar de forma controlada o backlog acumulado durante a queda.
7. **Teste de Fumaça (Sanity Test):** Realizar uma execução de teste fim a fim para garantir o sucesso.
8. **Liberação Comercial:** Homologar com o Dono do Processo e liberar a operação.

5. Critérios de Retorno à Normalidade e Reconstituição

* [ ] Reprocessamento de dados ou cargas pendentes.
* [ ] Auditoria e conciliação manual para verificação de duplicidade ou erros.
* [ ] Realização da Análise de Causa Raiz (RCA - Root Cause Analysis).
* [ ] Registro de Lições Aprendidas e atualização deste documento template.

6. Limitações Conhecidas da Estratégia

* Dependência direta de provedores de internet e nuvem de terceiros.
* Tempo de RTO elástico devido ao modelo de provisionamento manual / semi-automatizado.
* Risco atrelado à integridade da última janela de backup realizada.

## **PARTE 4: ANEXOS (MODELO DE TESTE DE INTEGRAÇÃO / API)**

| Tipo de Teste | O que valida na prática? | Frequência |
| :---- | :---- | :---- |
| **Health Check** | Disponibilidade técnica pura (Endpoint responde com HTTP 200, DNS resolve). | Diário / Automatizado |
| **Teste Funcional** | Criação de uma transação fictícia de homologação fim a fim no sistema. | Mensal / Trimestral |
| **Teste de Contingência** | Forçar a falha (mockar a API) e medir se a equipe consegue operar sem ela. | Semestral |
| **Simulação de DR** | Teste de recuperação completa, revalidação de tokens e DNS pós-queda. | Anual |
