# Sources for the university lists

Date checked: 2026-11-09. Files are sorted by name, de-duplicated, and every file parses as JSON. `aka` values and some cities were added from general knowledge (not from the source lists) so people can match what they type on LinkedIn.

Note: none of the official ministry or accreditor sites were fetched, apart from the Nigerian NUC. Where a country says "Wikipedia", the list is a Wikipedia list that cites the official body, not the official body's own page.

| Country | File | Count | Main source |
|---|---|---|---|
| Nigeria | nigeria.json | 328 | NUC (official) |
| United Kingdom | united-kingdom.json | 154 | Wikipedia, following gov.uk recognised bodies |
| Egypt | egypt.json | 109 | Wikipedia (fallback) |
| Saudi Arabia | saudi-arabia.json | 46 | Wikipedia (fallback), pruned |
| UAE | united-arab-emirates.json | 60 | Wikipedia (CAA-based) plus knowledge |
| Lebanon | lebanon.json | 37 | Wikipedia (MEHE-based) |
| Syria | syria.json | 33 | Wikipedia mirror (MoHE via The New Arab) |
| Jordan | jordan.json | 31 | Wikipedia plus knowledge |
| Greece | greece.json | 25 | Wikipedia |
| Morocco | morocco.json | 24 | Wikipedia (partial) |

## Nigeria (328)
- Official: National Universities Commission, https://www.nuc.edu.ng/nigerian-univerisities/federal-univeristies/ (77), /state-univerisity/ (69), /private-univeristies/ (182). All fetched successfully on the date above.
- Judgement calls: all NUC entries are kept as listed, including those marked 2025-2026 and the "Open" universities (Miva, Iconic, West Midlands, Al-Muhibbah, Unique, American). Some very new entries have no website listed and may not be operating yet. Ojaja University is listed with the alias Crown Hill; Benue State University appears under its new name (Moses Orshio Adasu University); Kogi/Borno/Yusuf Maitama Sule renames carry the old names in `aka`. The NUC lists "Federal University of Environment and Technology, Tai Town, Ogoniland". Cities are the NUC location text, simplified.

## United Kingdom (154)
- Source: Wikipedia "List of universities in the United Kingdom" (https://en.wikipedia.org/wiki/List_of_universities_in_the_United_Kingdom), which states it follows the gov.uk "recognised bodies" list and the Office for Students register.
- Rule used: institutions with university title, or listed on that page as a recognised body with degree awarding powers. Added from the page's recognised-body table: Courtauld Institute of Art, London Business School, LSHTM, Royal Academy of Music. Added from knowledge: Royal College of Art (university-level, recognised).
- Left out: small specialist colleges and further-education colleges with no university title, and the Institute of Cancer Research and Royal Central School of Speech and Drama.
- City is the main campus (first listed).

## Egypt (109)
- Fallback: Wikipedia "List of universities in Egypt" (https://en.wikipedia.org/wiki/List_of_universities_in_Egypt). The Supreme Council of Universities site was not fetched.
- Includes public universities, the 24 "national" (ahliya) universities, special/other universities, and private universities.
- Left out: Military Technical College (military). The Wikipedia "Al-Rasheed Private University" row has a placeholder reference (example.com), so it was left out as unverified. Helwan University is now "Capital University" in the source; `aka` records both names. Several Wikipedia rows have no city; cities were filled from general knowledge.
- Possibly incomplete: Egypt has more private and national universities than this list shows.

## Saudi Arabia (46)
- Fallback: Wikipedia "List of universities and colleges in Saudi Arabia" (https://en.wikipedia.org/wiki/List_of_universities_and_colleges_in_Saudi_Arabia). The Ministry of Education page was not fetched.
- Left out: technical colleges, community colleges, institutes, and the Arab East / Al Farabi / Technical Trainers type colleges. Kept two named medical colleges (Ibn Sina National College, Fakeeh College) and Batterjee Medical College as degree-awarding.
- Added from knowledge because the source page is out of date: Jouf University (the page says "Al Jawf"), Prince Mohammad Bin Fahd University (page says "Prince Mohammad University"), Riyadh Elm University. Count is below the expected ~60, because the source page is old and mixes in colleges. Probably missing newer private universities.

## United Arab Emirates (60)
- Source: Wikipedia "List of universities and colleges in the United Arab Emirates" (https://en.wikipedia.org/wiki/List_of_universities_and_colleges_in_the_United_Arab_Emirates), which says it lists CAA-accredited institutions. The CAA portal was not fetched.
- Left out: military colleges, INSEAD, London Business School, Manchester Worldwide, Emirates Institute for Banking (training bodies), SAE Institute, Strathclyde Dubai, Bradford hub, City University of London Dubai centre, Exeter (flagged citation needed), University of Balamand in Dubai (on probation, no new admissions), and Saint-Petersburg State Economic University and Saint Joseph University, whose status I could not confirm.
- Added from knowledge and the page's QS table and footnote: University of Sharjah, MBRU, University of Kalba and Fujairah (listed), MODUL, Michigan State and University of South Wales Dubai (page footnote).
- Free-zone institutions (KHDA/Dubai International Academic City) are not recognised by the federal Ministry per the source. Several branch campuses here are KHDA-licensed. Treat these as a judgement call.
- Count is a bit below the expected ~70, and the list is not guaranteed to match the CAA register exactly.

## Lebanon (37)
- Source: Wikipedia "List of universities in Lebanon" (https://en.wikipedia.org/wiki/List_of_universities_in_Lebanon), citing the Ministry of Education and Higher Education (https://www.mehe.gov.lb). The ministry's own list page was not fetched.
- Left out: "university institutes and colleges" (Joyaa, Ouzai, Matn, Sidoon), Near East School of Theology / Saint Paul Institute, the Lebanese National Higher Conservatory of Music, and three entries without an "official registration" mark whose status I could not confirm: East International University, Saint George University of Beirut, University of Sciences & Arts in Lebanon. Kept Al Maaref, Phoenicia and Rafik Hariri although they also lack the mark on Wikipedia.
- The page states the ministry's official register has 20 universities, so this list is broader than the ministry's register.

## Syria (33)
- Source: Wikipedia mirror of "List of universities and colleges in Syria" (https://wiki.krisyotam.com/content/wikipedia_en_all_nopic_2026-03/List_of_universities_in_Syria), which cites The New Arab (12 Feb 2025) on the Ministry of Higher Education recognising 59 universities and institutes. The live English page did not render its tables, and the Ministry site was not fetched.
- Included: public universities, the Syrian Virtual University, HIAST and HIBA, 39-private-university list items that are in recognised areas, and the AASTMT Latakia branch.
- Left out: military and police academies, universities run by the North and East Syria autonomous administration (not recognised by the ministry), Faculty of Theology (Damascus), the northern Aleppo/Idlib private universities of 2014-2024 that I could not confirm as ministry-recognised (Al-Shamal, Mari, Al-Sham Azaz, Al-Hayat, Aram, Syrian University for Science and Technology, Basaksehir, Al-Zahraa, Al-Maali, Al-Zaytuna, Al-Ruwad, Al-Amanos, Al-Maarif, The Islamic University, International University for Science and Renaissance, Bilad Al-Sham). Situation is in flux after December 2024; this list needs review.
- Cities follow the source (some are governorates, e.g. Daraa, so city is approximate).

## Jordan (31)
- Source: Wikipedia "List of universities in Jordan" (https://en.wikipedia.org/wiki/List_of_universities_in_Jordan). The Higher Education Accreditation Commission list was not fetched.
- Left out: community colleges, Jordan Academy of Music, Jordan Media Institute, Jordan Institute of Banking Studies, Jordan Academy for Maritime Studies, Queen Noor Civil Aviation Technical College, National University College of Technology, Luminus Technical University College, Columbia University Amman branch.
- Added from knowledge (not on the Wikipedia page body): Al al-Bayt University, Tafila Technical University, Jerash University, Zarqa University, Ajloun National University, Hashemite University. Cities from general knowledge. Close to the expected ~30.

## Greece (25)
- Source: Wikipedia "List of universities in Greece" (https://en.wikipedia.org/wiki/List_of_universities_in_Greece), which lists the state university system. The Ministry of Education list was not fetched.
- Included: 23 state universities from the page's table, plus Athens School of Fine Arts and ASPETE (added from knowledge, both are higher education institutions with degree rights).
- Left out: foreign branches and private colleges (only recently allowed to open under Greek law), police and military academies.

## Morocco (24)
- Source: Wikipedia "List of universities in Morocco" (https://en.wikipedia.org/wiki/List_of_universities_in_Morocco), whose reference is a 2013 Ministry of Higher Education list of authorised private institutions. This is the weakest list. Not verified against the current ministry list.
- Included: public universities and named private universities and recognised private universities.
- Left out: grandes ecoles and business schools without "University" in the name (HEM, ESCA-type schools, ISGA, etc.), and doubtful private entries. Some newer private universities (for example Université Euromed's peers, UM6 affiliates, Universite Privee de Casablanca) may be missing.
