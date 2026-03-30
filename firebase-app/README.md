# 🚀 BIA - Firebase + Apps Script

Aplicação BIA com frontend no Firebase Hosting e backend no Google Apps Script.

---

## ✅ BACKEND JÁ CONFIGURADO

✓ Apps Script API: `https://script.google.com/.../exec`  
✓ `config.js` atualizado com a URL da API

---

## 🚀 DEPLOY DO FRONTEND

### Opção 1: Script Automático (Windows)

```bash
cd c:\Projetos\Crise-Continuidade\firebase-app
deploy.bat
```

O script vai:
1. Fazer login no Firebase
2. Inicializar o projeto
3. Fazer o deploy

### Opção 2: Manual

```bash
cd c:\Projetos\Crise-Continuidade\firebase-app

# 1. Login
firebase login

# 2. Inicializar (apenas primeira vez)
firebase init hosting
```

**Durante o `firebase init`:**
- Escolha: **Create a new project** (ou use um existente)
- Public directory: `public` ✓ (já está correto)
- Configure as SPA: **Yes** ✓
- Overwrite index.html: **No** ✓

```bash
# 3. Deploy
firebase deploy
```

---

## 🧪 TESTAR LOCALMENTE

```bash
firebase serve
```

Acesse: `http://localhost:5000`

---

## 📋 CHECKLIST

- [x] Backend (Apps Script) implantado
- [x] URL da API configurada em `config.js`
- [x] Firebase CLI instalado
- [ ] `firebase login`
- [ ] `firebase init hosting`
- [ ] `firebase deploy`
- [ ] Testar no navegador

---

## 🎯 PÁGINAS IMPLEMENTADAS

- ✅ **Perguntas** — CRUD completo
- ✅ **Áreas** — CRUD completo
- ⏳ **Processos** — Placeholder (expandir em `app.js`)
- ⏳ **Admin** — Placeholder (expandir em `app.js`)
- ⏳ **Questionário** — Placeholder (expandir em `app.js`)

---

## 🐛 Troubleshooting

**Erro de CORS:**
- Certifique-se de que a Web App está com "Quem tem acesso: Qualquer pessoa"

**Página em branco:**
- Abra o Console (F12) e veja os erros
- Verifique se `API_URL` em `config.js` está correto

**API não responde:**
- Teste: `https://sua-url/exec?action=getPerguntas`
- Deve retornar JSON
