---
description: Deploy the Next.js application to Vercel
---

1. Ensure you have the [Vercel CLI](https://vercel.com/download) installed:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Initialize the deployment (follow prompts):
   ```bash
   vercel
   ```

4. Set the Environment Variable:
   ```bash
   vercel env add GEMINI_API_KEY
   ```

5. Deploy to production:
   ```bash
   vercel --prod
   ```
