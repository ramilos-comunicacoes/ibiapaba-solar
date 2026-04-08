# IBIAPABA SOLAR – Sistema de Gestão

Sistema completo de gestão para associação de energia solar no modelo de **geração distribuída compartilhada** (Lei 14.300/2022).

## 🌐 Acesso Online
[**ibiapaba-solar.github.io**](https://ramilos-comunicacoes.github.io/ibiapaba-solar/)  
*(Link disponível após ativar GitHub Pages)*

## ✅ Funcionalidades

- **Dashboard** – KPIs em tempo real, alertas inteligentes, gráfico de geração
- **Simulador Profissional** – Fórmula oficial do estatuto com margem de segurança
- **Clientes** – Cadastro completo com histórico de consumo
- **Usina** – Registro de geração mensal com análise de performance
- **Rateio Inteligente** – Distribuição automática conforme estatuto
- **Financeiro** – Receitas, projeções e lançamentos
- **Backup** – Exportação/importação JSON + backup automático local

## ⚖️ Fórmulas Implementadas

```
ValorContribuição = (Cmc - Cgd) × 0,80
EnergiaCliente = (ConsumoCliente / ConsumoTotal) × GeraçãoUsina
```

## 🛡️ Conformidade Legal
- Lei 14.300/2022
- Normas ANEEL / SCEE
- Custo de disponibilidade mínimo: Mono=30kWh | Bi=50kWh | Tri=100kWh
- Margem de segurança padrão: 10%

## 🚀 Como usar

Abra `index.html` diretamente no navegador — funciona 100% offline.

## 📦 Tecnologia

HTML + CSS + JavaScript puro · IndexedDB · Sem dependências externas
