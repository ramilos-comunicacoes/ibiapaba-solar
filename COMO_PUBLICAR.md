## Como publicar no GitHub Pages

### Passo 1 — Instalar Git (se ainda não tiver)
Baixe em: https://git-scm.com/download/win

### Passo 2 — Abrir PowerShell na pasta do sistema
Clique com botão direito na pasta `SISTEMA IBIAPABA SOLAR` → "Abrir no Terminal"

### Passo 3 — Executar os comandos abaixo (um por vez)

```powershell
git init
git add .
git commit -m "feat: Sistema IBIAPABA SOLAR v1.0"
git branch -M main
git remote add origin https://github.com/ramilos-comunicacoes/ibiapaba-solar.git
git push -u origin main
```

### Passo 4 — Ativar GitHub Pages
1. Acesse https://github.com/ramilos-comunicacoes/ibiapaba-solar
2. Clique em **Settings** → **Pages**
3. Em "Source", selecione **Deploy from a branch**
4. Branch: **main** | Folder: **/ (root)**
5. Clique em **Save**

### Passo 5 — Acessar o sistema online
Após ~2 minutos:
👉 https://ramilos-comunicacoes.github.io/ibiapaba-solar/

### Atualizações futuras
Sempre que modificar o sistema, rode:
```powershell
git add .
git commit -m "atualização: descrição do que mudou"
git push
```
O GitHub Pages publica automaticamente!
