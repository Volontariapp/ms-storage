# Microservice Storage (ms-storage)

## Project Overview

Le microservice **`ms-storage`** est en cours de mise en place selon l'architecture DDD/CQRS du
projet Volontariapp (voir `ms-user` pour le modèle de référence). Cette première itération est un
squelette d'infrastructure : NestJS + connexion PostgreSQL (via `@volontariapp/bridge-nest` et
TypeORM) + healthcheck. Aucune logique métier n'est encore implémentée — le futur package
`@volontariapp/domain-storage` (npm-packages) portera les entités et cas d'usage.

## Getting Started

### Prérequis

- **Node.js** (>= 24.14.0)
- **Package Manager** : Yarn v4 (`corepack enable`)
- PostgreSQL accessible (voir `ci-tools/docker-compose.yml`, service `postgres-storage`).

### Installation

```bash
cd ms-storage
yarn install
```

### Commandes d'exécution

```bash
yarn start:dev
```

Vérifier la connexion à la base de données :

```bash
curl http://localhost:3006/health
```
