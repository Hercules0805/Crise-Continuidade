# 🚀 BIA - Hospedagem Alternativa

Como o Firebase requer billing, aqui estão **3 alternativas gratuitas** para hospedar o frontend:

---

## ✅ Opção 1: GitHub Pages (Mais Simples)

### 1. Criar repositório no GitHub
```bash
cd c:\Projetos\Crise-Continuidade\firebase-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/bia-app.git
git push -u origin main
```

### 2. Ativar GitHub Pages
1. Acesse: `https://github.com/SEU_USUARIO/bia-app/settings/pages`
2. Source: **Deploy from a branch**
3. Branch: **main** → Folder: **/public**
4. Save

**URL:** `https://SEU_USUARIO.github.io/bia-app/`

---

## ✅ Opção 2: Netlify (Drag & Drop)

1. Acesse: `https://app.netlify.com/drop`
2. Arraste a pasta `public` para o navegador
3. Pronto! URL gerada automaticamente

**URL:** `https://random-name.netlify.app`

---

## ✅ Opção 3: Vercel (CLI)

```bash
npm install -g vercel
cd c:\Projetos\Crise-Continuidade\firebase-app\public
vercel
```

Siga as instruções no terminal.

**URL:** `https://bia-app.vercel.app`

---

## ✅ Opção 4: Servidor Local (Teste)

```bash
cd c:\Projetos\Crise-Continuidade\firebase-app\public
python -m http.server 8000
```

**URL:** `http://localhost:8000`

---

## 🎯 Qual escolher?

- **GitHub Pages** — Melhor para projetos open source
- **Netlify** — Mais rápido (drag & drop)
- **Vercel** — Melhor performance
- **Servidor Local** — Apenas para testes

---

## ⚠️ IMPORTANTE

Após hospedar em qualquer uma dessas opções, a aplicação vai funcionar normalmente porque:
- ✅ Backend (Apps Script) já está no ar
- ✅ Frontend é 100% estático (HTML/CSS/JS)
- ✅ Comunicação via fetch() para a API do Apps Script

Não precisa de Firebase!
