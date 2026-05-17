# Follow-Up Reminder · Monday.com Board View

אפליקציית תזכורות פולואפ למאנדיי. קופצת כפופאפ לפי עמודת תאריך, מסונן למשתמש המחובר.

## פריסה ב-Vercel
1. גרור את התיקייה הזו ל-vercel.com → New Project
2. או דחוף ל-GitHub → Import Project
3. Vercel יזהה אוטומטית Vite ויפרוס

## הגדרת עמודות במאנדיי
ערוך את `src/App.jsx` בתוך `COLUMN_IDS` עם ה-IDs האמיתיים של העמודות בבורד הלידים שלך.

## מצב פיתוח
ב-`src/App.jsx` משתנה `USE_MOCK = true` נותן הדגמה עם נתוני דמה.
החלף ל-`false` ובטל הערות בבלוק `PRODUCTION INTEGRATION` בתוך `useMondayData`.
