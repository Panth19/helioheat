FROM node:20-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm --prefix backend install --omit=dev && npm --prefix frontend install
COPY backend ./backend
COPY frontend ./frontend
RUN npm --prefix frontend run build
ENV PORT=3001
EXPOSE 3001
CMD ["node", "backend/server.js"]
