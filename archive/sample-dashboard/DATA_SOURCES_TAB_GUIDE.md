# 📊 DATA SOURCES TAB & OPENCITY DATAJAM
## Dashboard Updates - Version 3.0

---

## 🆕 NEW: Data Sources Tab

A comprehensive new tab has been added to the dashboard that documents all data sources used in the Chennai Mobility Equity analysis.

### What's in the Data Sources Tab?

**6 Data Source Cards:**

1. **Census 2011**
   - Government of India Census
   - 155 wards coverage
   - Variables: Population, literacy, housing, occupation, sanitation
   - Access: OpenCity CKAN Portal
   - Link: https://data.opencity.in/dataset/chennai-census-2011-data

2. **Economic Census 2012-13**
   - Ministry of Statistics, Government of India
   - 3.33L businesses, 7.79L workers
   - Variables: Employment, business types, gender, sectors
   - Access: OpenCity CKAN Portal
   - Link: https://data.opencity.in/dataset/economic-census-2012-13

3. **Slum Census Data**
   - Census of India 2001 & 2011 Provisional Data
   - 400+ settlements, 1.34M residents
   - Variables: Locations, population, housing type, amenities
   - Access: data.gov.in
   - Link: https://data.gov.in/resource/slum-housing-and-population-data-chennai-2011

4. **OpenStreetMap**
   - Collaborative global geographic database
   - Complete Chennai metropolitan coverage
   - Variables: Bus routes, MRTS stations, metro lines, streets, POIs
   - Access: OpenStreetMap.org
   - Link: https://www.openstreetmap.org

5. **Transit Authority Data**
   - MTC, CMRL, MRTS official sources
   - MTC: 668 routes, 3,488 buses, 3.233M daily passengers
   - MRTS: 21 stations, 23.98 km, 200k daily riders
   - Metro: 5 lines (Phases 1-4)

6. **OpenCity CKAN Portal**
   - Chennai's open government data portal
   - Datasets: Ward boundaries, demographics, municipal records
   - License: Open Data Commons
   - Link: https://data.opencity.in

---

## 📋 Methodology & Metrics Section

The Data Sources tab also includes detailed methodology documentation:

### 1. **SEC Classification**
- Socioeconomic Classification based on occupation and education
- 5-tier system: A/B (high), C (middle), D/E (low)
- Derived from Census 2011 proxy variables
- Used to segment the population into equity analysis

### 2. **Transit Accessibility**
- % of population within 400m walking distance of transit stop
- Calculated using Overpass API for OpenStreetMap data
- Standard benchmark for urban transit accessibility
- Isochrones generated for visual analysis

### 3. **Equity Score**
- Composite index (0-100) scoring methodology
- Components:
  - Transit Access: 35%
  - Infrastructure Quality: 25%
  - Socioeconomic Vulnerability: 25%
  - Employment Connectivity: 15%
- Classifies wards: Critical (<40), High Need (40-55), Moderate (55-70), Low Need (>70)

### 4. **Data Quality**
- Census 2011 is most recent comprehensive dataset
- OpenStreetMap data validated against official MTC/CMRL sources
- Slum data from multiple years reconciled using spatial methods
- Quality checks documented for reproducibility

### 5. **Limitations**
- Census 2011 is 15 years old (data from 2011)
- Ward boundaries changed in 2015; data estimated using spatial allocation
- Pedestrian infrastructure not in datasets; requires field audit
- Some employment data from Economic Census 2012-13

### 6. **Attribution & Licensing**
- Built on OpenStreetMap (ODbL License)
- Census 2011 (Public Domain)
- OpenCity CKAN (Open Data Commons)
- Dashboard licensed under CC-BY-4.0

---

## 🏙️ OpenCity Datajam Branding

All references to "Elastic Tree" have been removed and replaced with **OpenCity Datajam 2026**.

### Changes Made:

**Header:**
- Before: "Chennai Last-Mile Connectivity & Equity Dashboard"
- After: "Chennai Mobility Equity Dashboard" + "OpenCity Datajam 2026"

**Footer:**
- Before: "Prepared by Elastic Tree Consumer Insights"
- After: "OpenCity Datajam 2026 | All data sources are open and freely accessible"

**Data Sources Tab Credit:**
- "OpenCity Datajam 2026 - This dashboard was created for OpenCity Datajam 2026 using publicly available datasets"

**Overall Theme:**
- Focus on open data and public participation
- Emphasizes all sources are freely accessible
- Celebrates collaborative nature of Datajam

---

## 🎨 Data Source Cards Design

Each data source is presented in a visually appealing card with:

- **Icon**: Different colored icon for each data type (CSV, Briefcase, Home, Map, Train, City)
- **Title**: Data source name and operator
- **Description**: Brief explanation of the dataset
- **Coverage**: Geographic and population coverage
- **Variables**: Key data fields included
- **Access**: Link to where data can be accessed
- **Color-Coded**: Each source has distinctive icon color

Card colors:
- Census 2011: Green (#51CF66)
- Economic Census: Yellow (#FFD43B)
- Slum Data: Red (#FF8787)
- OpenStreetMap: Light Blue (#CADCFC)
- Transit: Yellow (#FFD43B)
- OpenCity Portal: Green (#51CF66)

---

## 🔗 Clickable Data Source Links

All data source cards include direct links to:
- OpenCity CKAN datasets
- Government data portals
- OpenStreetMap website
- Transit authority websites
- Other public data repositories

Users can click directly to explore the original data sources.

---

## 📱 Tab Navigation Update

The dashboard now has **5 tabs** instead of 4:

1. **🗺️ Interactive Map** - Geospatial visualization
2. **📊 Cross-Tabulations** - Data tables with SEC/Transit breakdown
3. **📈 Analytics** - Charts and visualizations
4. **🏘️ Ward Details** - Drill-down analysis per ward
5. **📚 Data Sources** ← **NEW TAB**

---

## 🎓 Educational Value

The Data Sources tab provides educational benefits:

- **Transparency**: Shows exactly where data comes from
- **Reproducibility**: Users can access original sources and replicate analysis
- **Trust**: Demonstrates use of official, government sources
- **Learning**: Explains methodology to non-technical users
- **Accessibility**: Links to all open data sources
- **Attribution**: Proper credit to data providers

---

## 🔬 Methodology Explanation for Non-Technical Users

The methodology section breaks down complex concepts:

**SEC Classification** - Explains how we categorize income levels
**Transit Accessibility** - Shows why 400m is the standard
**Equity Score** - Illustrates how we combine metrics into one number
**Data Quality** - Explains why we trust the data
**Limitations** - Honest about what we don't have
**Attribution** - Gives credit to data providers

---

## 📊 Use Cases for Data Sources Tab

**Students & Researchers:**
- Access original government datasets
- Understand methodology for replication
- Learn about urban mobility equity

**Policy Makers:**
- Verify data sources for policy decisions
- Understand equity metrics
- Reference for funding proposals

**Civil Society:**
- Contribute to Datajam initiatives
- Participate in data documentation
- Engage with open data movement

**Developers:**
- Access APIs for data
- Build on top of open datasets
- Create new visualizations

---

## 🌐 OpenCity Datajam 2026

### What is Datajam?

OpenCity Datajam is an annual event in Chennai that:
- Brings together data enthusiasts, developers, researchers
- Uses publicly available datasets
- Creates solutions for urban challenges
- Promotes open data culture
- Builds data literacy

### Dashboard as Datajam Contribution

This dashboard:
- ✅ Uses only publicly available data
- ✅ All sources are open and freely accessible
- ✅ Code and methodology fully transparent
- ✅ Can be replicated and improved by others
- ✅ Demonstrates data-driven civic engagement
- ✅ Contributes to understanding urban equity challenges

---

## 📦 Complete Data Flow

```
Original Data Sources
        ↓
┌──────────────────────┐
│  Census 2011         │
│  Econ Census 2012-13 │
│  Slum Data           │
│  OpenStreetMap       │
│  Transit Authority   │
│  OpenCity Portal     │
└──────────────────────┘
        ↓
   Data Processing
   (R Scripts)
        ↓
   Equity Analysis
   (Metrics Calculated)
        ↓
   Dashboard
   (Interactive Viz)
        ↓
   Data Sources Tab
   (Full Transparency)
```

---

## 🎯 Key Statistics from Data Sources

**Total Population Analyzed:** 4.73 Million  
**Slum Residents:** 1.34 Million (29%)  
**Wards Covered:** 155 original → 200 estimated  
**Transit Stops:** 2,400+  
**Bus Routes:** 668 (MTC)  
**Metro Stations:** 21 (MRTS) + 100+ (CMRL planned)  
**Economic Units:** 3.33 Lakh businesses  
**Workers Counted:** 7.79 Lakh (Economic Census)  

---

## ✨ Design Features of Data Sources Tab

- **Grid Layout**: Cards flow responsively (3 cards per row on desktop)
- **Color Coding**: Each source has distinct visual identity
- **Interactive Links**: Direct URLs to data sources
- **Methodology Cards**: 6 detailed methodology explanations
- **Credit Section**: Highlights OpenCity Datajam participation
- **Dark Mode**: Consistent with dashboard dark theme
- **Mobile Responsive**: Works perfectly on all devices

---

## 🚀 Benefits of Data Sources Tab

### For Users:
- ✅ Know where data comes from
- ✅ Understand how metrics are calculated
- ✅ Access original datasets if interested
- ✅ Verify findings independently

### For Credibility:
- ✅ Complete transparency
- ✅ Scientific rigor
- ✅ Reproducibility
- ✅ Trust building

### For Datajam Movement:
- ✅ Showcases open data usage
- ✅ Demonstrates value of public datasets
- ✅ Encourages data participation
- ✅ Contributes to data literacy

---

## 📖 How to Explore Data Sources

1. **Click "Data Sources" tab** in dashboard
2. **Browse the 6 source cards** to understand data origins
3. **Click any link** to access the original data
4. **Read methodology section** to understand how analysis was done
5. **Check limitations** to understand data constraints
6. **View credits** to see Datajam acknowledgment

---

## 🎉 Complete Rebranding Summary

**Removed:**
- ❌ Elastic Tree Consumer Insights references
- ❌ Company-specific branding
- ❌ Internal team mentions

**Added:**
- ✅ OpenCity Datajam 2026 branding
- ✅ Data sources tab
- ✅ Methodology documentation
- ✅ Direct links to open datasets
- ✅ Transparency & attribution section
- ✅ Educational focus

---

**Result:** A professional, publicly-focused dashboard that celebrates open data and urban participation through OpenCity Datajam 2026.

