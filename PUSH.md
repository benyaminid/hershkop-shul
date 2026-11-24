# התראות Push באתר הרשקופ-שול (נוסף 24.11.2026, Claude)

> תמצית תפעולית נמצאת ב-README.md, סעיף 13א. מסמך זה מכיל את הפירוט המלא.

## מה זה עושה
כפתור "🔔 התראות" בדף הבית (מתחת לכפתור נהלי החלוקה) פותח חלונית. לכל קטגוריה: כבוי/דלוק, ומצב: **מיד** כשהאתר מתעדכן, או **פעם ביום בשעה שנבחרה** (05:00–23:00, שעון ישראל).

| קטגוריה | מה מפעיל אותה | קישור בהתראה |
|---|---|---|
| `lottery` – הגרלה שבוצעה | `POST /api/lottery` (הגרלה שבועית מוצלחת) | `/#fathers` |
| `products` – מוצרים חדשים | `POST /api/admin/products` (יצירת מוצר שאינו מוסתר). כמה מוצרים שנשמרים ברצף מאוחדים להתראה אחת (~20 שניות שקט) | `/#shop-all` |
| `bulletin` – עלון חדש | `PUT /api/bulletin` | `/#bulletin` (לא אומת שזה שם העמוד בפועל) |
| `news` – הודעות | `PUT /api/banners` כשנוסף מזהה באנר שלא היה קודם | `/#updates` |

בקטגוריית "הודעות" מוצגת הערה שההודעות נשלחות במקביל לקבוצת הוואטסאפ ולא רלוונטיות למי שעוקב אחריה. עריכת מוצר קיים, שינוי מלאי או הסתרה אינם שולחים התראה.

## איך זה עובד
- **Web Push ללא payload.** השרת שולח "דחיפת הערה" חתומה ב-VAPID (ללא הצפנת תוכן). ה-Service Worker (`sw.js`, אירוע `push`) פונה ל-`POST /api/push/inbox`, מקבל את ההודעות שממתינות למכשיר ומציג אותן. אם אין הודעה, מוצג "יש עדכון חדש באתר".
- **אחסון ב-R2** (אותו bucket, `PRODUCT_IMAGES`), ללא binding או secret חדשים:
  - `push-subscribers.json` – מנויים: endpoint, העדפות, תור הודעות לשליחה (`outbox`) והודעות של "פעם ביום" (`pending`).
  - `push-vapid.json` – מפתח VAPID שנוצר אוטומטית בבקשה הראשונה. **המפתח הפרטי נשמר שם**, ולא ב-Secrets (סטייה מההנחיה לשמור סודות ב-Secrets; הקובץ אינו נגיש דרך `/api/images/`).
  - `push-batch.json` – איחוד התראות מוצרים. `push-meta.json` – זמן ה-flush האחרון.
- **אבטחה:** נקודות הקצה של מנויים בודקות Origin ומקבלות רק endpoints מ-FCM, Mozilla, Apple ו-Windows (מניעת SSRF). עד 3,000 מנויים. לא נשמר מידע אישי מעבר ל-endpoint.

## "פעם ביום" – איך זה משתחרר
`functions/_lib/push.js` → `flushDue` משחרר הודעות שהגיע זמנן (הזמן הוא הפעם הבאה שבה השעה שנבחרה מגיעה, בשעון ישראל). אין מתזמן ייעודי, ולכן יש שני מנגנונים:

1. **אוטומטי, תמיד פעיל:** `functions/_lib/push-lazy.js` מפעיל את `flushDue` (לכל היותר פעם ב-10 דקות) בכל טעינת `GET /api/banners`, כלומר בכניסה הראשונה לאתר אחרי השעה שנבחרה. ההודעה מגיעה לכן בכניסה הראשונה של מישהו אחרי השעה, ולא בהכרח בדיוק בה.
2. **מתוזמן, דורש הוספה ידנית:** קובץ GitHub Actions שקורא ל-`POST /api/push/flush` כל 15 דקות. הוא מבטיח שחרור בזמן גם כשאין מבקרים. לטוקן של Claude אין הרשאת workflow (שגיאה 403), ולכן הקובץ נוצר ידנית.

### הוספת הקובץ המתוזמן (מהטלפון, דרך GitHub באתר)
1. להיכנס ל-github.com/benyaminid/hershkop-shul (אם צריך, "Desktop site" בתפריט הדפדפן).
2. Add file ← Create new file.
3. בשדה השם להקליד `.github/workflows/push-flush.yml` (הסלאשים יוצרים את התיקיות).
4. להדביק:

```yaml
name: Push notifications flush
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:
jobs:
  flush:
    runs-on: ubuntu-latest
    steps:
      - name: Release due daily notifications
        run: curl -sS -m 30 -X POST https://hershkop-shul.pages.dev/api/push/flush || true
```

5. Commit changes (ל-`main`).
6. לבדיקה: לשונית Actions ← "Push notifications flush" ← Run workflow. בלוג הריצה אפשר לראות את התשובה (`{"success":true,"moved":...}`).

הערות: ב-GitHub Actions ריצות מתוזמנות מתעכבות לפעמים בכמה דקות, והן מושבתות אחרי כ-60 יום בלי פעילות במאגר. אפשר גם לקרוא ידנית ל-`POST /api/push/flush`; הוא פתוח, ומשחרר רק הודעות שכבר הגיע זמנן.

## קבצים
`push.js` (ממשק; נטען מ-`popup.js`), `sw.js` (אירועי push ו-notificationclick), `functions/_lib/push.js`, `functions/_lib/push-lazy.js`, `functions/api/push/{config,subscribe,inbox,flush}.js`, ווים ב-`functions/api/{lottery,bulletin,banners}.js` ו-`functions/api/admin/products.js`.

## מגבלות ובדיקות שטרם נעשו
- נבדקה בתוך סביבת בדיקה ללוגיקה בלבד (חישוב שעות ישראל, חתימת VAPID ואימותה, סינון endpoints, תורים, ניקוי מנויים שפג תוקפם). **לא נבדק מול מכשיר אמיתי ולא אומתה פריסה.**
- באייפון נדרש iOS 16.4+ והתקנה למסך הבית. לא ידוע אם iOS מציג דחיפה ללא payload.
- אחרי שהמשתמש מבטל הרשאה בדפדפן, המנוי נמחק רק כשהשרת מקבל 404/410 מהשירות.
- `sw.js` עודכן ל-`hershkop-shul-v36`, אך **תווית הגרסה וחותמת "עדכון אחרון" בתפריט `index.html` לא עודכנו** (כרגע v35).
