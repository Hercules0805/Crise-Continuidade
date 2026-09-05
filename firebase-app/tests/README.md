# Testes das Security Rules do Firestore

Testes de `../firestore.rules` com `@firebase/rules-unit-testing` rodando no
emulador do Firestore.

## Pré-requisitos

- **Java** (JDK 11+) instalado e no PATH — obrigatório para o emulador do Firestore.
- Firebase CLI (`firebase --version`).
- `npm install` nesta pasta.

## Rodar

```
# nesta pasta (firebase-app/tests)
npm test
```

O script sobe o emulador do Firestore (config em `../firebase.json`) e executa o
Jest com `--runInBand`.

## Cobertura

- Leitura: usuário do domínio lê; fora do domínio e anônimo são negados.
- Catálogos/config: escrita só admin; gestor negado.
- Processos/respostas: admin escreve qualquer área; gestor só a própria área.

## Validação sem emulador

A compilação das regras pode ser verificada sem Java com:

```
cd firebase-app
firebase deploy --only firestore:rules --project bia-forte-2025 --dry-run
```
