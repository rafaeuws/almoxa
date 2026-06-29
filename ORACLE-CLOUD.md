# Deploy no Oracle Cloud (Always Free) — passo a passo

Hospedagem **gratuita e sempre ligada** (sem hibernar), com app + PostgreSQL na mesma máquina via Docker, e HTTPS automático com Caddy. O Always Free da Oracle oferece um servidor ARM generoso (até 4 OCPUs e 24 GB de RAM) sem custo.

> Você precisará cadastrar um cartão no registro (verificação de identidade). Recursos "Always Free" **não são cobrados**. Se preferir não correr risco de cobrança, deixe a conta sem fazer upgrade para "Pay As You Go".

---

## 1. Criar a conta
1. Acesse https://www.oracle.com/cloud/free/ e crie a conta (Always Free).
2. Escolha a **região "home"** mais próxima (ex.: Brazil East — São Paulo). A região não pode ser trocada depois.

## 2. (Opcional, recomendado) Ter um domínio
Para HTTPS com cadeado válido, tenha um domínio (ou subdomínio) apontando para o IP da máquina. Sem domínio, dá para acessar por HTTP no IP (bom só para testes). Domínio gratuito é possível via serviços como DuckDNS.

## 3. Criar a instância (máquina virtual)
1. No console: **Menu ☰ → Compute → Instances → Create instance**.
2. **Image and shape:**
   - Image: **Canonical Ubuntu 22.04** (ou 24.04).
   - Shape: clique em **Change shape → Ampere (ARM) → VM.Standard.A1.Flex** e defina algo como **2 OCPUs / 12 GB** (dentro do Always Free de 4 OCPU/24 GB). Se aparecer "out of capacity", reduza para 1 OCPU/6 GB ou tente outra região/horário.
3. **SSH keys:** marque **Generate a key pair for me** e **baixe a chave privada** (guarde bem) — ou cole sua chave pública.
4. **Networking:** mantenha "Create new VCN" com sub-rede pública e **Assign a public IPv4 address**.
5. Clique **Create**. Anote o **Public IP address** quando a instância ficar "Running".

## 4. Liberar as portas (passo que mais confunde)
São **dois** lugares — precisa fazer os dois.

**a) Security List (firewall da rede Oracle):**
1. Na página da instância → clique na **VCN** → **Security Lists → Default Security List → Add Ingress Rules**.
2. Adicione duas regras:
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**.
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **443**.

**b) Firewall interno do Ubuntu (a imagem da Oracle bloqueia tudo por padrão):**
Depois de conectar por SSH (passo 5), rode:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
(Para testar sem domínio na porta 3000, libere também a 3000 nos dois lugares.)

## 5. Conectar por SSH
No seu computador, com a chave baixada:
```bash
chmod 600 sua-chave.key
ssh -i sua-chave.key ubuntu@SEU_IP_PUBLICO
```

## 6. Instalar Docker e Docker Compose
```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker        # aplica o grupo sem precisar deslogar
docker --version && docker compose version
```

## 7. Enviar o projeto para o servidor
**Opção A — Git (recomendado):** suba o projeto para um repositório (GitHub) e:
```bash
git clone https://github.com/SEU_USUARIO/almoxarifado-cloud.git
cd almoxarifado-cloud
```
**Opção B — Copiar do seu PC** (rode no seu computador, não no servidor):
```bash
scp -i sua-chave.key -r ./almox-cloud ubuntu@SEU_IP_PUBLICO:~/almoxarifado-cloud
```
Depois, no servidor: `cd ~/almoxarifado-cloud`.

## 8. Configurar o ambiente (.env)
```bash
cp .env.example .env
nano .env
```
Ajuste, no mínimo:
- `PGPASSWORD=` uma senha forte para o banco
- `JWT_SECRET=` um texto longo e aleatório (ex.: gere com `openssl rand -hex 32`)
- `ADMIN_PASSWORD=` a senha do admin
- `SITE_ADDRESS=` o seu domínio (ex.: `almox.seudominio.com`) **ou** `:80` se não tiver domínio
Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

> Se for usar domínio: crie um registro **A** no seu provedor de DNS apontando o domínio para o **IP público** da instância **antes** de subir, para o Caddy conseguir emitir o certificado.

## 9. Subir a aplicação
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
O banco sobe, o schema e o usuário admin são criados automaticamente, e o Caddy publica nas portas 80/443.

Acompanhe os logs (útil se algo falhar):
```bash
docker compose -f docker-compose.prod.yml logs -f
```

## 10. Acessar
- Com domínio: **https://almox.seudominio.com** (HTTPS já com cadeado).
- Sem domínio: **http://SEU_IP_PUBLICO** (porta 80).
Entre com **admin** e a senha do `ADMIN_PASSWORD`; troque a senha no primeiro acesso.

---

## Operação no dia a dia

**Atualizar o sistema** (após mudar o código / dar `git pull`):
```bash
cd ~/almoxarifado-cloud
git pull                       # se usou git
docker compose -f docker-compose.prod.yml up -d --build
```

**Backup do banco** (faça com regularidade):
```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U almox almoxarifado > backup_$(date +%F).sql
```
Agendar diariamente (crontab `crontab -e`), às 3h:
```
0 3 * * * cd ~/almoxarifado-cloud && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U almox almoxarifado > ~/backup_$(date +\%F).sql
```

**Restaurar um backup:**
```bash
cat backup_2026-01-01.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U almox almoxarifado
```

**Comandos úteis:**
```bash
docker compose -f docker-compose.prod.yml ps        # status dos serviços
docker compose -f docker-compose.prod.yml restart   # reiniciar
docker compose -f docker-compose.prod.yml down      # parar (dados ficam no volume)
docker stats                                         # uso de CPU/memória
```

## Observações importantes
- **Custo:** zero, desde que use apenas recursos Always Free e não faça upgrade da conta. Acompanhe em Billing → Cost Analysis.
- **"Out of host capacity":** a capacidade ARM gratuita é concorrida. Se der esse erro ao criar a instância, tente menos OCPUs, outra disponibilidade (AD) ou outro horário. Há scripts que tentam repetidamente, mas o painel já costuma resolver com paciência.
- **Imagens ARM:** o projeto usa `node` e `postgres` Alpine, que têm versões ARM64 — rodam normalmente no shape Ampere.
- **Segurança:** mantenha o sistema atualizado (`sudo apt-get upgrade`), troque o `JWT_SECRET` e a senha do admin, e guarde backups fora do servidor (baixe os `.sql` com `scp`).
- **HTTPS:** o Caddy renova o certificado sozinho. Basta o domínio continuar apontando para o IP e as portas 80/443 abertas.
