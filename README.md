# GlucoPulse AI

Monitoreo de glucosa + registro de comidas por foto con IA. Cruza tus
lecturas de un sensor CGM con fotos de tus platos para detectar qué
alimentos te disparan picos de glucosa.

**Stack:** TypeScript · Vite · Sass · Firebase (Auth + Firestore) · Groq
(IA de visión y chat) vía funciones serverless de Vercel.

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar Firebase

1. Creá un proyecto en https://console.firebase.google.com
2. Habilitá **Authentication → Email/Password** y **Firestore Database**.
3. Copiá `.env.example` a `.env`:

```bash
cp .env.example .env
```

4. Completá las variables `VITE_FIREBASE_*` con los datos de tu proyecto
   (Configuración del proyecto → tus apps → SDK config).

## 3. Configurar Groq (IA)

1. Creá una cuenta gratis en https://console.groq.com/keys (sin tarjeta).
2. Generá una API key.
3. En el mismo `.env`, completá:

```
GROQ_API_KEY=gsk_tu_clave_aca
```

   **Importante:** esta variable NO lleva el prefijo `VITE_` a propósito.
   Así Vite nunca la incluye en el bundle del navegador — solo la leen las
   funciones serverless en `api/`.

## 4. Correr en desarrollo

El proyecto usa dos piezas: el frontend (Vite) y las funciones serverless
en `api/` (Groq). Para que ambas funcionen juntas en local, arrancá con:

```bash
npm run dev
```

(Este script corre `vercel dev`, que sirve el frontend Y las funciones
`api/groq-vision` y `api/groq-chat` en el mismo puerto — así no hay
problemas de CORS.) La primera vez te va a pedir loguearte con GitHub o
email y confirmar el nombre del proyecto; podés aceptar los valores por
defecto.

Si en algún momento solo querés levantar el frontend sin las funciones
(por ejemplo para tocar estilos rápido, sin usar IA), podés usar:

```bash
npm run dev:vite-only
```

## 5. Estructura del proyecto

```
api/                      → Funciones serverless (Vercel)
  groq-vision.ts             analiza fotos de comida
  groq-chat.ts                responde el chat del asistente

src/
  index.ts                 → punto de entrada + router simple por hash
  pages/
    inicio.ts                login / registro
    principal.ts              dashboard: gráfica, CSV, registrar comida
  components/
    AddGlucoseModal.ts       modal de medición manual
    MealCaptureModal.ts      modal de captura de foto de comida
    AiChatWidget.ts          widget de chat flotante
  services/
    firebase.ts               inicialización de Firebase
    glucoseService.ts        lectura/escritura de mediciones en Firestore
    aiFoodService.ts          llama a /api/groq-vision y guarda el resultado
  utils/
    glucoseAnalyzer.ts       parseo de CSV + estadísticas por período
    glucoseEvaluator.ts      clasifica un valor de glucosa (rango/color)
    mealGlucoseCorrelator.ts cruza una comida con la curva de glucosa
  types/
    glucose.ts, meal.ts       tipos compartidos
  styles/
    main.scss                 estilos globales (Sass)
```

## 6. Desplegar a producción

```bash
npx vercel
```

Te va a pedir configurar `GROQ_API_KEY` (y las variables `VITE_FIREBASE_*`)
como variables de entorno del proyecto en el dashboard de Vercel — no hace
falta tarjeta de crédito para el plan Hobby.

## 7. Si Groq da error "model not found"

Los modelos de visión de Groq están en preview y cambian seguido. Si pasa,
entrá a https://console.groq.com/docs/vision, copiá el nombre de modelo
vigente y reemplazalo en `api/groq-vision.ts` (una sola línea, `model: '...'`).
