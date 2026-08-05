# 📚 DATA SOURCES TAB - VISUAL OVERVIEW
## OpenCity Datajam Dashboard v3.0

---

## TAB NAVIGATION

```
┌────────────────────────────────────────────────────────────┐
│  🗺️ MAP  │  📊 TABLES  │  📈 CHARTS  │  🏘️ WARDS  │  📚 DATA ◄── NEW!
├────────────────────────────────────────────────────────────┤
│                                                              │
│              DATA SOURCES & METHODOLOGY                     │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

---

## DATA SOURCES TAB CONTENT STRUCTURE

```
┌──────────────────────────────────────────────────────────────┐
│                    DATA SOURCES TAB                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  📊 6 DATA SOURCE CARDS (Grid Layout)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ 📊 CSV       │  │ 💼BRIEFCASE  │  │ 🏠HOME       │ │ │
│  │  │              │  │              │  │              │ │ │
│  │  │ Census 2011  │  │ Econ Census  │  │ Slum Data    │ │ │
│  │  │              │  │ 2012-13      │  │              │ │ │
│  │  │ 155 wards    │  │ 3.33L units  │  │ 400+ places  │ │ │
│  │  │              │  │ 7.79L worker │  │ 1.34M people │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  │                                                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ 🗺️ MAP       │  │ 🚂 TRAIN     │  │ 🏙️ CITY      │ │ │
│  │  │              │  │              │  │              │ │ │
│  │  │OpenStreetMap │  │ Transit Data │  │ OpenCity     │ │ │
│  │  │              │  │              │  │ CKAN Portal  │ │ │
│  │  │ Complete GIS │  │ 668 routes   │  │ 155 wards    │ │ │
│  │  │ networks     │  │ 2,400+ stops │  │ Municipal    │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  🔬 METHODOLOGY SECTION (6 Columns)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │ SEC        Transit        Equity      Data Quality    │ │
│  │ Class      Accessibility  Score       Assessment      │ │
│  │                                                        │ │
│  │ Limitat'n  Attribution                               │ │
│  │ & Caveats  & Licensing                                │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  💖 OPENCITY DATAJAM CREDIT SECTION                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 💖 OpenCity Datajam 2026                              │ │
│  │                                                        │ │
│  │ This dashboard was created for OpenCity Datajam      │ │
│  │ 2026 using publicly available datasets. All data     │ │
│  │ sources are open and freely accessible. The project  │ │
│  │ demonstrates how open data can leverage to           │ │
│  │ understand urban mobility equity challenges.         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## DATA SOURCE CARD EXAMPLE

```
┌─────────────────────────────────┐
│ 📊 Census 2011                  │ ← Icon + Title
├─────────────────────────────────┤
│ Government of India Census      │ ← Description
│ conducted in 2011               │
├─────────────────────────────────┤
│ Coverage: 155 wards across      │ ← Coverage
│ Greater Chennai                 │
│                                 │
│ Variables: Population, literacy,│ ← What's included
│ housing, occupation, sanitation │
│                                 │
│ Access: OpenCity CKAN ← Link    │ ← Where to get it
│                                 │
│ https://data.opencity.in...     │ ← Clickable URL
└─────────────────────────────────┘
```

---

## DATA SOURCE ICONS & COLORS

```
📊 CSV Icon (Green #51CF66) ............. Census 2011
💼 Briefcase (Yellow #FFD43B) ........... Economic Census
🏠 Home (Red #FF8787) .................. Slum Census
🗺️ Map (Light Blue #CADCFC) ........... OpenStreetMap
🚂 Train (Yellow #FFD43B) .............. Transit Data
🏙️ City (Green #51CF66) ................ OpenCity Portal
```

---

## METHODOLOGY CARDS GRID

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ SEC          │  │ Transit      │  │ Equity       │
│ Classification    Accessibility    Score         │
│              │  │              │  │              │
│ 5-tier       │  │ 400m walking │  │ Composite    │
│ income       │  │ distance     │  │ 0-100 index  │
│ based on     │  │ benchmark    │  │ 4 weighted   │
│ occupation   │  │ for transit  │  │ components   │
│ & education  │  │ access       │  │              │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│ Data Quality │  │ Limitations  │
│              │  │              │
│ Census 2011  │  │ Census 15yo  │
│ official     │  │ Ward bound.  │
│ sources      │  │ changed 2015 │
│ validated    │  │ No pedestrian│
│ against      │  │ infra data   │
│ transit data │  │ Needs audit  │
└──────────────┘  └──────────────┘
```

---

## COLOR-CODED LEGEND

```
Data Sources by Color:

🟢 Green (#51CF66)  → Official Government Datasets
🟡 Yellow (#FFD43B) → Census & Economic Data
🔴 Red (#FF8787)    → Vulnerable Population (Slums)
🔵 Blue (#CADCFC)   → Crowdsourced Community Data
⚪ White/Gray       → Infrastructure & Services
```

---

## RESPONSIVE LAYOUT

### Desktop (1920px+)
```
┌─────────────────┬─────────────────┬─────────────────┐
│ Card 1          │ Card 2          │ Card 3          │
├─────────────────┼─────────────────┼─────────────────┤
│ Card 4          │ Card 5          │ Card 6          │
└─────────────────┴─────────────────┴─────────────────┘
```

### Tablet (768px)
```
┌─────────────────┬─────────────────┐
│ Card 1          │ Card 2          │
├─────────────────┼─────────────────┤
│ Card 3          │ Card 4          │
├─────────────────┼─────────────────┤
│ Card 5          │ Card 6          │
└─────────────────┴─────────────────┘
```

### Mobile (320px+)
```
┌─────────────────┐
│ Card 1          │
├─────────────────┤
│ Card 2          │
├─────────────────┤
│ Card 3          │
├─────────────────┤
│ Card 4          │
├─────────────────┤
│ Card 5          │
├─────────────────┤
│ Card 6          │
└─────────────────┘
```

---

## DATA ACCESSIBILITY FLOW

```
User Opens Dashboard
        ↓
Explores Map, Tables, Charts
        ↓
Asks: "Where does this data come from?"
        ↓
Clicks "Data Sources" Tab
        ↓
Sees 6 Data Source Cards
        ↓
Can Click Links to Access Original Data
        ↓
Can Read Methodology Section
        ↓
Can Understand Limitations
        ↓
Can Access Datajam Credit
        ↓
Can Replicate Analysis or Build Upon It
```

---

## KEY INFORMATION HIERARCHY

```
┌────────────────────────────────────┐
│ DATA SOURCE TITLE + ICON (Large)   │ ← What is it?
├────────────────────────────────────┤
│ One-line description               │ ← Quick summary
├────────────────────────────────────┤
│ COVERAGE: Geographic & Population  │ ← How much data?
├────────────────────────────────────┤
│ VARIABLES: List of fields/metrics  │ ← What's included?
├────────────────────────────────────┤
│ ACCESS: Link to actual data         │ ← Where to get it?
├────────────────────────────────────┤
│ https://direct-link-here            │ ← Click to access
└────────────────────────────────────┘
```

---

## FEATURE CALLOUTS

```
NEW TAB ADDITIONS:

✨ 6 Data Source Cards
   - Census 2011
   - Economic Census 2012-13
   - Slum Census Data
   - OpenStreetMap
   - Transit Authority Data
   - OpenCity CKAN Portal

✨ Methodology Documentation
   - SEC Classification explained
   - Transit Accessibility defined
   - Equity Score calculation
   - Data Quality assurance
   - Limitations documented
   - Attribution & licensing

✨ Direct Data Access Links
   - Click to access original datasets
   - OpenCity CKAN Portal
   - Government data portals
   - OpenStreetMap
   - Transit authority sites

✨ OpenCity Datajam Credit
   - Celebrates open data
   - Shows collaborative spirit
   - Encourages participation
```

---

## BRAND REMOVAL & OPENCITY ADDITION

```
BEFORE (Elastic Tree):
┌──────────────────────────────────────┐
│ Elastic Tree Consumer Insights       │
│ Last-Mile Connectivity Dashboard     │
│ Prepared by Elastic Tree...          │
└──────────────────────────────────────┘

AFTER (OpenCity Datajam):
┌──────────────────────────────────────┐
│ OpenCity Datajam 2026                │
│ Chennai Mobility Equity Dashboard    │
│ OpenCity Datajam 2026 | All data     │
│ sources are open and freely access.  │
└──────────────────────────────────────┘
```

---

## LINK DIRECTORY

All clickable links in Data Sources tab:

```
Census 2011:
→ https://data.opencity.in/dataset/chennai-census-2011-data

Economic Census 2012-13:
→ https://data.opencity.in/dataset/economic-census-2012-13

Slum Census:
→ https://data.gov.in/resource/slum-housing-and-population-data-chennai-2011

OpenStreetMap:
→ https://www.openstreetmap.org

OpenCity CKAN:
→ https://data.opencity.in
```

---

## PROFESSIONAL POLISH ELEMENTS

✨ Gradient backgrounds on cards  
✨ Smooth hover animations  
✨ Color-coded icons  
✨ Responsive grid layout  
✨ Professional typography  
✨ High contrast text  
✨ Accessibility-friendly  
✨ Dark mode optimized  
✨ Mobile-responsive  
✨ Direct clickable links  

---

## READY FOR OPENCITY DATAJAM

This Data Sources tab makes the dashboard:

✅ Transparent - All sources documented
✅ Credible - Proper attribution given
✅ Reproducible - Others can access same data
✅ Educational - Explains methodology
✅ Civic-Focused - Shows open data value
✅ Professional - Premium visual design
✅ Accessible - Works on all devices
✅ Shareable - Perfect for presentations

---

**Perfect for OpenCity Datajam 2026!** 🎉

