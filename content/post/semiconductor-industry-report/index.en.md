---
title: "Semiconductors and Chips: Industry History, Value Chain, Markets, and Risks"
date: 2026-09-28
lastmod: 2026-10-03
description: "An evidence-based guide to semiconductor history, design and manufacturing, market structure, AI demand, policy, and supply-chain risks."
tags: ["Industry Research Report", "DEX", "Semiconductors", "Chips"]
categories:
  - "Industry Report"
  - "Semiconductors"
image: "cover.webp"
draft: false
---

## Scope and Data Notes

In this report, the “semiconductor industry” includes chip design, electronic design automation (EDA) software and semiconductor intellectual property (IP), manufacturing equipment and materials, wafer fabrication, packaging and testing, and major end uses. Historical events are dated to when they occurred. Company financials, capacity, and process developments generally reflect information through December 31, 2025; policy information is updated through September 27, 2026. Citation scope and access notes were reviewed on October 3, 2026; this source review does not change the stated data cutoffs. Market-share figures are cited only when the source specifies the market boundary, time period, and measurement basis. Definitions of “foundry,” “AI accelerator,” and “advanced process” vary across organizations, so figures using different definitions should not be compared directly.

## Executive Summary

Semiconductors are not a single market. They are a cross-border industrial network spanning design tools, architecture and circuit IP, manufacturing equipment, critical materials, wafer fabrication, packaging and testing, and end systems. Development cycles, capital needs, and business models differ substantially across these activities. Software and IP businesses depend on research, ecosystem compatibility, and long-term licensing relationships. Equipment and materials require lengthy process qualification. Wafer fabrication relies on sustained capital investment, yield learning, and capacity utilization. Packaging and testing are expanding from conventional back-end services into system-level integration. A single “smile curve” or industry-wide gross-margin range cannot adequately describe this structure.

Three forces have shaped the industry over the past eight decades. The first is progress in devices and manufacturing, from the transistor, integrated circuit, and planar process to FinFETs, gate-all-around transistors, and extreme ultraviolet (EUV) lithography. The second is a change in industrial organization. The rise of the dedicated foundry allowed design and manufacturing to be performed by different companies, supporting a specialized ecosystem of fabless designers, foundries, outsourced assembly and test providers (OSATs), and tool suppliers. The third is a shift in demand, from mainframes and consumer electronics to personal computers, mobile communications, cloud computing, automotive electronics, and today's AI infrastructure.

By the end of 2025, AI training and inference demand was driving investment in advanced logic, advanced packaging, high-bandwidth memory (HBM), and high-speed interconnects. That growth, however, was not reaching every semiconductor category equally. Mature-node chips, analog and power devices, consumer memory, and industrial semiconductors remained subject to their own inventory cycles and end-market demand. Governments were also using incentives, research programs, and export controls to strengthen supply security. As a result, supply-chain decisions increasingly balance cost and scale against compliance, regional capacity, and resilience.

## 1. How the Industry Developed

### 1.1 From Vacuum Tubes to Silicon Transistors

Electronic computers of the 1940s relied heavily on vacuum tubes. Tubes could amplify and switch electrical signals, but their size, power consumption, heat, and limited service life constrained miniaturization and reliability. In 1947, a Bell Laboratories team developed the point-contact transistor, establishing solid-state devices as a promising alternative.[H18](https://www.computerhistory.org/siliconengine/invention-of-the-point-contact-transistor/)

Early transistors were mainly made of germanium. In 1954, Morris Tanenbaum at Bell Laboratories produced a silicon transistor. At Texas Instruments, Gordon Teal organized the research laboratory and recruited a technical team led by Willis Adcock that developed commercial silicon transistors. These devices offered a wider operating-temperature range than germanium devices.[H01](https://www.computerhistory.org/siliconengine/silicon-transistors-offer-superior-operating-characteristics/) A later manufacturing advantage was the use of an adherent, electrically insulating oxide layer to separate surface interconnections, as described in Robert Noyce's device-and-lead patent.[H17](https://patents.google.com/patent/US2981877A/en)

In 1957, eight engineers left Shockley Semiconductor Laboratory to establish Fairchild Semiconductor. Fairchild and the companies that grew out of it became an important part of Silicon Valley's semiconductor startup network. The defensible conclusion is that this event accelerated the circulation of technical talent, venture capital, and new firms; it was not the sole origin of Silicon Valley's entrepreneurial culture.

One of the key Bell Laboratories patents associated with the point-contact transistor is John Bardeen and Walter Brattain's US 2,524,035, *Three-Electrode Circuit Element Utilizing Semiconductive Materials*.[H15](https://patents.google.com/patent/US2524035A/en) Its patent grant date is distinct from the 1947 laboratory demonstration.

### 1.2 Integrated Circuits, the Planar Process, and Moore's Law

Replacing vacuum tubes with individual transistors did not solve the problems of connecting large numbers of components or manufacturing them at scale. Integrated circuits and the planar process emerged in the late 1950s. Through oxidation, photolithography, diffusion, and metal interconnection, the planar process made it possible to form and connect multiple devices on the surface of a single silicon wafer. It laid the foundation for high-volume monolithic integrated circuits.

Early integrated circuits took different technical approaches. Jack Kilby's relevant patent is US 3,138,743, *Miniaturized Electronic Circuits*. Robert Noyce's is US 2,981,877, *Semiconductor Device-and-Lead Structure*.[H16](https://patents.google.com/patent/US3138743A/en)[H17](https://patents.google.com/patent/US2981877A/en)

In 1965, Gordon Moore used the limited data then available to predict that the number of components on an integrated circuit would roughly double every year for the next decade. In 1975, he revised the cadence to approximately every two years.[H02](https://www.intel.com/content/www/us/en/newsroom/resources/moores-law.html) What became known as “Moore's Law” was both an empirical observation and a reference point for coordinating technology roadmaps across design, equipment, materials, and manufacturing. It does not imply that the price of every chip automatically falls. Whether the cost per function declines also depends on die area, yield, design complexity, packaging, and utilization.

### 1.3 Microprocessors, Memory Competition, and US–Japan Adjustments

Intel introduced the 4004 in 1971 after developing it for a calculator.[H03](https://www.intel.com/content/www/us/en/newsroom/opinion/chip-that-changed-world.html) It was a commercial four-bit microprocessor containing approximately 2,300 transistors, specifications given in Intel's 50th-anniversary infographic.[H20](https://download.intel.com/newsroom/2021/data-center/4004-infographic.pdf) Its significance lay in showing that a general-purpose programmable processor could be sold as a standardized product. The personal-computer market subsequently emerged through the combined development of eight- and 16-bit processors, memory, software, and complete computer systems. The 4004 alone did not “directly launch the PC era.”

From the late 1970s through the 1980s, DRAM became a focal point of competition between Japanese and US companies. Japan's Ministry of International Trade and Industry supported a VLSI research program, while manufacturers' production capabilities, quality control, and domestic electronics demand also contributed to their growth.[H14](https://www.meti.go.jp/report/tsuhaku2018/2018honbun/i2220000.html) A historical study by the US International Trade Commission reports that Japanese firms' share of the global DRAM market rose from less than 30% in 1978 to nearly 75% in 1986.[H04](https://usitc.gov/sites/default/files/publications/332/working_papers/semiconductor_working_paper_corrected_103119.pdf) Those dated figures are more precise than a general claim of “nearly 80% in the mid-1980s.”

Intel exited DRAM in 1985, the year it introduced the 386 processor.[H21](https://www.intel.com/content/dam/www/central-libraries/us/en/documents/semiconductors-and-intel-introduction.pdf) Its consumer-facing Intel Inside cooperative marketing program formally began in 1991.[H05](https://www.intel.com/content/www/us/en/history/virtual-vault/articles/end-user-marketing-intel-inside.html) The 1986 US–Japan Semiconductor Agreement primarily addressed access to the Japanese market and anti-dumping concerns. Later arrangements referred to an industry expectation that foreign suppliers would reach a 20% share of the Japanese market, not a binding floor reserved for US chips.[H06](https://ustr.gov/archive/Document_Library/Reports_Publications/1996/1996_National_Trade_Estimate/1996_National_Trade_Estimate-Japan.html)

### 1.4 Dedicated Foundries and Vertical Specialization

Vertically integrated manufacturers dominated the industry's early years, often handling product definition, design, wafer fabrication, packaging, and testing within one company. It would nevertheless be inaccurate to say that *all* companies followed the integrated device manufacturer (IDM) model. Specialization expanded as process development and fab construction became more expensive.

TSMC was founded in 1987 and built its business around a dedicated foundry model: it manufactured customers' designs without selling its own branded chips.[H07](https://investor.tsmc.com/static/annualReports/2025/english/index.html) This model enabled design companies to bring products to market without building advanced fabs, while foundries aggregated demand from multiple customers to spread process R&D and capacity investment. It created more room for fabless companies such as Qualcomm, NVIDIA, and Broadcom. AMD moved toward a fabless model much later, after spinning off manufacturing assets to GlobalFoundries in 2009–2010.[H08](https://ir.amd.com/financial-information/sec-filings/content/0001193125-10-009806/dex991.htm)

### 1.5 Immersion Lithography, FinFETs, and EUV

In the early 2000s, the industry faced growing pressure to improve the resolution of 193 nm argon-fluoride (ArF) lithography. A 157 nm exposure path had been explored, but it posed challenges for materials and optical systems. Immersion lithography placed ultrapure water between the projection lens and wafer, increasing numerical aperture and improving resolution and depth of focus while retaining the 193 nm light source. The wavelength remained 193 nm; resolution improved through the larger numerical aperture. ASML's December 2003 announcement reported TSMC's order for the industry's first immersion lithography tool. This historical reference was corroborated in search-indexed text; its original URL now redirects to a general news index rather than the announcement.[H19](https://www.asml.com/en/news/press-releases/2003/tsmc-selects-asml-for-industry-first-immersion-tool-order) Commercial production still required collaborative work across fabs, optics, light sources, photoresists, and research institutions.[H09](https://www.asml.com/en/company/stories/2023/how-immersion-lithography-saved-moores-law)[S01](https://www.asml.com/technology/lithography-principles/lenses-and-mirrors)

In transistor architecture, Hitachi researchers demonstrated the DELTA precursor in 1989; a University of California, Berkeley team led by Chenming Hu subsequently developed and named the FinFET.[H13](https://technav.ieee.org/topic/finfets/) Berkeley's institutional history also credits Jeff Bokor and Tsu-Jae King as collaborators. These overview sources do not establish a precise date for the naming.[H10](https://eecs.berkeley.edu/about/history/) Intel began high-volume production of its 22 nm tri-gate transistor in 2012.[H11](https://www.intel.com/content/www/us/en/history/history-moores-law-fun-facts-factsheet.html) FinFET is therefore best understood as the product of sustained research and industrialization by multiple teams, rather than the invention of a single researcher.

EUV lithography uses 13.5 nm light. ASML delivered its first production-oriented EUV system in 2013, and customers gradually adopted EUV for advanced logic and memory production later in the 2010s. The first High-NA EUV system was delivered in 2023.[H12](https://www.asml.com/en/products/euv-lithography-systems) Prices, configurations, and revenue-recognition practices differ significantly across system generations; any quoted equipment price must specify the model, year, currency, and accounting basis.

### 1.6 Mobile Computing, AI, and Heterogeneous Integration

Smartphones increased demand for highly integrated, low-power systems on a chip (SoCs), radio-frequency front ends, image sensors, and mobile memory. They also helped drive advanced manufacturing from planar transistors toward FinFETs. More recently, generative AI has shifted attention toward parallel computing, HBM, high-speed networks, and advanced packaging. GPUs are well suited to massively parallel workloads, but CPUs, GPUs, purpose-built accelerators, and network processors generally work together in a system. “GPUs replace CPUs” is too simple a description.

As the cost of designing and producing a single large die rises, chiplets and advanced packaging have become important ways to scale systems. A chiplet architecture does more than mechanically split a large logic chip. It assigns compute, input/output, cache, or analog functions to separately designed and manufactured dies, then integrates them through standard or proprietary interconnects. “More than Moore” is broader: it also encompasses the extension of functions such as sensing, radio frequency, power, optoelectronics, and heterogeneous materials. It should not be treated as synonymous with chiplets.

## 2. The Semiconductor Value Chain

{{< industry-map id="semiconductors" >}}

### 2.1 Chip Design, EDA, and Semiconductor IP

Chip design begins with product requirements and system architecture, then proceeds through logic design, functional verification, synthesis, placement and routing, timing closure, physical verification, and tape-out preparation. EDA software links design rules, foundry process design kits, and manufacturing constraints. Its value comes from algorithms, complete tool flows, process compatibility, and years of accumulated validation data.

Semiconductor IP consists of designed and verified modules that can be reused in a chip, including processor cores, memory controllers, PCIe, DDR, USB, SerDes, and security blocks. An *instruction set architecture* (ISA) must be distinguished from *processor IP*. Arm licenses both architectures and processor-core IP. RISC-V is an open-standard ISA, not a processor core that can be manufactured directly; companies must still develop or license a specific implementation.[S02](https://riscv.org/about/) x86 is a proprietary ISA ecosystem, with Intel and AMD as its principal product suppliers.

Digital devices include CPUs, GPUs, microcontrollers, FPGAs, SoCs, network processors, and AI accelerators. Analog and mixed-signal chips manage power, data conversion, amplification, and sensor interfaces. RF and optoelectronic devices handle wireless transmission and reception, filtering, power amplification, and conversion between electrical and optical signals. These categories differ in design cycle, software dependence, product life, and process needs. An advanced node is not the only measure of a chip's value.

### 2.2 Manufacturing Equipment and Materials

Front-end equipment includes lithography, etching, thin-film deposition, ion implantation, thermal processing, cleaning, chemical-mechanical polishing (CMP), metrology, and defect inspection systems. Back-end equipment includes thinning and dicing, die attach, bonding, molding, probe systems, automatic test equipment (ATE), and sorting equipment. Atomic layer deposition (ALD) is especially useful for thickness control and conformal coverage in high-aspect-ratio structures. “High selectivity” applies to particular selective deposition processes, not to every ALD tool.

Critical materials include silicon wafers and compound-semiconductor substrates, photoresists, masks, electronic gases, wet chemicals, deposition precursors, CMP consumables, sputtering targets, package substrates, and bonding materials. Purity specifications vary by material and process; they cannot all be summarized as “nine nines.” In gas classification, phosphine, arsine, and diborane can be used for doping. Nitrogen trifluoride is primarily used for chamber cleaning and some etching processes, rather than as a typical dopant gas.

Qualification for high-volume production often takes substantial time. A supplier must demonstrate more than the specifications of a single tool or material batch: customers also need stable performance across lots, defect control, service capability, and compatibility with their process platform. This joint optimization helps explain high concentration in some niches. It does not mean that every segment has only one supplier.

### 2.3 Wafer Fabrication

Wafer manufacturers are commonly divided into IDMs and foundries. An IDM sells its own products and performs at least some manufacturing; a dedicated foundry primarily manufactures customer designs. In practice, the boundary is not absolute. Some IDMs offer foundry services to external customers, while some systems companies take a direct role in chip design and supply-chain management.

A typical front-end process repeatedly applies film formation, photoresist coating, exposure, development, etching, ion implantation, thermal processing, cleaning, and CMP to form transistors and multiple interconnect layers on a wafer. After front-end fabrication, a foundry delivers a *processed wafer* or diced dies, not a “bare wafer.” A bare wafer is generally a substrate on which device structures have not yet been formed.

Process-node names identify generations of manufacturing platforms; they no longer correspond to a single directly measurable physical dimension. “2 nm” or “Intel 18A” therefore does not mean that every transistor feature measures 2 nm or 1.8 nm. Process capability should be assessed through transistor architecture, density, performance, power, yield, design rules, and production status. Intel 18A uses RibbonFET gate-all-around transistors and PowerVia backside power delivery. In 2025, Intel disclosed that the first 18A client product had entered production and that it planned to begin high-volume production that year.[S03](https://newsroom.intel.com/intel-foundry/intel-18a-process-technology-simply-explained)[S06](https://www.intel.com/content/www/us/en/newsroom/news/client-computing/postcard-itt-panther-lake-draws-cameras-and-crowds.html)

### 2.4 Packaging and Testing

Conventional packaging protects the die, provides electrical and mechanical connections, and supports assembly into a system. Advanced packaging also enables dense interconnects, more bandwidth, power management, and heterogeneous integration. Flip-chip packaging connects a die to its substrate through bumps. In 2.5D packaging, a silicon interposer or redistribution structure can connect multiple side-by-side dies. In 3D packaging, dies are stacked using hybrid bonding, through-silicon vias (TSVs), or other vertical interconnects. CoWoS is a 2.5D and related advanced-packaging platform; it should not be conflated with every form of 3D stacking.[S07](https://3dfabric.tsmc.com/english/dedicatedFoundry/technology/cowos.htm)

HBM typically stacks DRAM dies above a base die and connects them through TSVs; the HBM package can then be integrated with a processor through advanced packaging.[S08](https://news.skhynix.com/en/sk-hynix-partners-with-tsmc-to-strengthen-hbm-technological-leadership/) 3D NAND, by contrast, stacks memory cells vertically within a NAND device. It is a device structure and manufacturing process, not a synonym for TSV-based die stacking.[S04](https://semiconductor.samsung.com/support/tools-resources/dictionary/semiconductor-glossary-3d-v-nand-flash-memory/)

Testing includes wafer-level probing, final testing after packaging, and reliability evaluation for particular uses. Automotive integrated circuits commonly undergo failure-mechanism-based stress tests and customer qualification under specifications such as AEC-Q100. AEC-Q100 Rev J states that AEC operates no certification board: suppliers perform qualification and submit the data for users to verify compliance. Qualification should therefore not be described as an AEC-issued certification.[S05](https://www.guerrilla-rf.com/includes/pdfs/general/AEC_Q100_Rev_J_Base_Document.pdf)

### 2.5 End Markets

Data centers use CPUs, GPUs and dedicated accelerators, HBM, network switches and optical interconnects, power-management devices, and security chips. Smartphones and PCs balance performance, energy use, wireless connectivity, and cost. Automotive electronics encompass microcontrollers, analog and power devices, cockpit and driver-assistance processors, sensors, and battery-management chips; they also require lengthy qualification and supply commitments. Industrial, renewable-energy, telecommunications, and defense applications place particular weight on reliability, long-term supply, environmental tolerance, or specific security requirements.

Advanced nodes are not essential for every application. Power management, analog, RF, sensors, and many automotive and industrial products continue to use mature processes extensively. An industry assessment should therefore track both advanced-node investment and mature-node inventories, utilization, and replacement demand.

## 3. Market Structure

### 3.1 Concentration and Interdependence

Some semiconductor segments are highly concentrated because R&D is expensive, customer qualification takes time, process knowledge is difficult to replicate quickly, and software and hardware ecosystems raise switching costs. That does not establish that the top three suppliers hold 70%–90% in “almost every” subsector. A sound market-share statement first defines the market—for example, complete EUV systems, discrete data-center GPUs, DRAM, foundry services, or OSAT—and then specifies the geography, period, and whether it measures revenue or shipments.

Regional specialization likewise cannot be reduced to closed “blocs.” US companies are strong in EDA, processor and accelerator design, and parts of the equipment market. Europe is prominent in lithography, optics, and certain automotive and industrial chips. Japan has important materials, equipment, and image-sensor companies. South Korea has large-scale memory producers. Taiwan plays a central role in foundry and packaging. Mainland China is expanding its mature-process, packaging, equipment, and materials capabilities. Cross-border investment, customer relationships, and supply dependencies remain extensive.

### 3.2 Chip Design and AI Computing

General-purpose processors, mobile SoCs, analog chips, and AI accelerators each have different competitive structures. NVIDIA leads in data-center GPUs and their software ecosystem, but a claim that it holds 80%–90% of “AI training and inference chips” lacks a consistent market boundary. In its review of NVIDIA's proposed acquisition of Run:ai, the European Commission's decision reported NVIDIA's *volume* share of the defined global discrete data-center GPU market in bracketed ranges: [80–90]% in each of 2021–2023 and [70–80]% in the first half of 2024. These are estimated ranges for the specified periods, not precise shares or a full-year 2024 result. The decision records NVIDIA's warning, as the notifying party, that volume estimates inferred from revenue and average purchase prices were less reliable than value shares.[M01](https://ec.europa.eu/competition/mergers/cases1/202516/M_11766_10599589_2740_3.pdf) The case illustrates why market share must be reported with its product scope, date, and method.

AMD and Intel offer GPUs or other accelerators, while cloud providers develop in-house or custom ASICs such as TPUs and Trainium. In-house chips can improve performance, cost, or supply control for specific workloads, but they do not automatically displace commercial GPUs. Their results depend on software tools, utilization, model fit, networking, and deployment scale.

### 3.3 Foundries and Advanced Processes

{{< market-share id="foundry-q4-2025" >}}

TSMC is the leading dedicated foundry. In its 2025 annual report, the company defined “Foundry 2.0” broadly to include logic wafer fabrication, packaging, testing, masks, and non-memory IDM activity, and estimated that market at US$305 billion in 2025. This is substantially broader than conventional dedicated foundry services; a Foundry 2.0 share should not be directly compared with a third-party pure-foundry share. TSMC also reported that its 3 nm process accounted for 24% of its own wafer revenue in 2025 and that its 2 nm process entered volume production in the fourth quarter of that year.[M02](https://investor.tsmc.com/static/annualReports/2025/english/index.html) Those figures describe TSMC's revenue mix and manufacturing progress, not the entire industry's 3 nm or 2 nm market share.

Samsung operates in memory, logic products, and foundry services, so its process investment must be considered alongside both internal IDM demand and external foundry customers. Intel offers manufacturing and packaging to external customers through Intel Foundry; the scale of 18A production and external customer adoption should be updated against subsequent earnings reports and product deliveries. SMIC, UMC, and GlobalFoundries also have different product mixes, process platforms, customer industries, and expansion priorities.

### 3.4 Memory and Advanced Packaging

The major DRAM suppliers include Samsung Electronics, SK hynix, and Micron. NAND participants also include Kioxia, Western Digital/SanDisk-related operations, and Solidigm. Memory is highly cyclical: prices respond to inventory, capital expenditure, product transitions, and end-market demand. HBM growth has prompted suppliers to invest in advanced DRAM, TSVs, and packaging. Any assertion that “two companies hold the overwhelming majority of HBM” should identify the quarter and whether it measures revenue or bit shipments, while accounting for changes at suppliers including Micron.

Foundries, memory makers, IDMs, and OSATs all participate in advanced packaging. ASE, Amkor, and JCET are major OSAT providers, while TSMC, Samsung, and Intel combine advanced packaging with front-end processes. Control is not simply shifting in one direction from OSATs to foundries. Platforms compete and overlap in interposers, hybrid bonding, HBM integration, testing, and volume delivery.

### 3.5 Equipment, Materials, and Profitability

ASML is currently the only company able to supply complete EUV lithography systems commercially. DUV, metrology, inspection, and other manufacturing-equipment markets have different competitors. ASML's 2025 annual report records €32.7 billion in total net sales, a gross margin of 52.8%, and revenue recognition for 48 EUV systems during its 2025 fiscal year.[M03](https://www.asml.com/en/investors/annual-report/2025) These figures illustrate the scale and technical barriers of the EUV business. They do not support a claim that every equipment monopoly earns a 60%–80% gross margin.

TSMC reported a gross margin of 59.9% for 2025. Revenue recognition, depreciation, and cost structures differ among EDA, IP, equipment, materials, foundries, and packaging and test providers.[M02](https://investor.tsmc.com/static/annualReports/2025/english/index.html) Profitability should therefore be analyzed using specific companies and a consistent fiscal year and accounting basis. At minimum, software licenses, equipment sales, materials, manufacturing, and testing should be distinguished rather than assigned fixed margins across the value chain.

## 4. Principal Risks and Constraints

### 4.1 Industry Cycles and Concentrated AI Demand

AI infrastructure is increasing demand for advanced logic, HBM, advanced packaging, networks, and power devices, but semiconductors remain subject to inventory and capital-spending cycles. If cloud providers slow investment, relevant suppliers could face order revisions and lower utilization. If AI-related revenue and computing demand continue to grow, advanced capacity could remain tight in the near term. These are conditional scenarios, not grounds for declaring an inevitable “ROI cliff” or “profit collapse.”

AI capacity does not crowd out every traditional chip category in equal measure. Advanced GPUs and automotive microcontrollers generally use different nodes and production lines, limiting direct substitution. HBM expansion may redirect some DRAM resources, but consumer-memory prices also depend on inventory, demand, and suppliers' capital discipline. Risk analysis needs to distinguish products and processes.

### 4.2 Industrial Policy, Export Controls, and Regionalization

The US CHIPS and Science Act allocated US$50 billion for the Department of Commerce to administer semiconductor incentives and R&D programs. That figure represents statutory program funding, not cash already paid to companies.[R01](https://www.nist.gov/chips/funding-updates) The European Chips Act took effect on September 21, 2023. In its release that day, the European Commission stated the EU's policy goal of raising its share of the global semiconductor market to 20% by 2030; that number is a historical policy target, neither an achieved share nor a firm forecast.[R02](https://digital-strategy.ec.europa.eu/en/news/digital-sovereignty-european-chips-act-enters-force) In June 2026, the European Commission proposed a Chips Act 2.0 to build on the original law. The proposal should be distinguished from the 2023 act already in force.[R05](https://digital-strategy.ec.europa.eu/en/library/proposal-chips-act-20)

Export controls are changing customer screening and delivery procedures for equipment, software, HBM, and advanced computing chips. In January 2025, the US Bureau of Industry and Security updated advanced-computing controls and foundry due-diligence requirements; related rules also changed definitions of advanced-node integrated circuits and the Entity List.[R03](https://www.bis.gov/press-release/commerce-strengthens-restrictions-advanced-computing-semiconductors-enhance-foundry-due-diligence-prevent) Businesses consequently face licensing, end-user, resale, technical-service, and geographic compliance risks. Policies can change, so a rule in force at one point should not be treated as a permanent industrial boundary.

Regional incentives can add local capabilities and geographic redundancy, but they can also raise construction costs, reduce utilization, intensify competition for talent, and complicate cross-border operations. Whether a project amounts to “duplicative capacity” depends on actual demand, its technology generation, and long-term utilization. Not every localization project can be assumed in advance to destroy economies of scale.

### 4.3 Technical Complexity and Recovery of Capital Investment

Advanced processes face short-channel effects, interconnect delay, power density, heat, stochastic defects, and growing design complexity. Gate-all-around transistors, backside power delivery, EUV, High-NA EUV, and advanced packaging offer new ways to scale, while increasing R&D, equipment, mask, design-migration, and yield-ramp costs. A node label is not a physical-limit gauge. The characters “2 nm” alone cannot establish that quantum tunneling has become the decisive obstacle for every product.

Investment in a fab or critical tool varies substantially with the project boundary, cleanroom, equipment mix, capacity, and location. A claim that a fab costs US$20–30 billion, or that a certain tool has a particular price, should identify a specific project or system, announcement date, currency, and whether infrastructure is included. Totals from different projects should not be substituted for one another.

### 4.4 Supply Concentration and Operational Continuity

Concentrated supply does create single-point risks. ASML is currently the sole commercial supplier of complete EUV systems, and some equipment subsystems, material formulations, and advanced-packaging capacities are concentrated among a small number of firms. Yet photoresists, metrology and inspection, and most process materials generally have multiple suppliers—even if an alternative cannot be qualified and substituted quickly. More useful risk measures include qualification time for replacements, inventory coverage, geographic concentration, capacity flexibility, and the cost of an alternative process. A blanket claim that there is “no second option anywhere in the world” obscures these differences.

Companies can reduce exposure through developing second sources, stocking critical spare parts, diversifying production sites, signing long-term purchase agreements, and conducting joint qualification. Because semiconductor tools and materials must be qualified against specific processes, establishing an alternative often takes months or longer. That work should begin during normal operations, before a supply interruption.

### 4.5 Electricity, Water, and Infrastructure

Advanced fabs require reliable electricity, ultrapure water, gases, and waste-treatment systems. AI data centers are increasing demand for high-density computing, cooling, and grid connections. The International Energy Agency estimates that data centers used about 415 TWh of electricity worldwide in 2024, or about 1.5% of global electricity consumption. In its 2025 base case, the IEA projects roughly 945 TWh by 2030.[R04](https://www.iea.org/reports/energy-and-ai) These are global model estimates; they do not mean that every regional grid will reach its limits at the same time.

Power constraints vary sharply by location, depending on grid-connection queues, generation mix, transmission and distribution capacity, and data-center clustering. Semiconductor companies should evaluate power reliability, water availability, extreme weather, and carbon costs when selecting sites. Data-center customers should also incorporate server utilization, model efficiency, and cooling methods into capacity planning.

### 4.6 Talent and Organizational Capability

Semiconductor production requires specialists in devices, materials, chemistry, mechanics, optics, software, quality, and equipment maintenance. New fabs need more than additional graduates: they need experienced teams that can introduce processes into volume production, improve yield, and keep tools running. Talent risk should not be described as an equally “severe shortage” in every region. It should be measured by project location, job category, hiring time, and turnover.

If industrial policy subsidizes buildings and machines without vocational training, research platforms, supplier engineering capacity, and arrangements for international talent mobility, new capital may be slow to turn into stable output. Companies should include training periods, succession for critical roles, replication across fabs, and supplier-service capacity in their expansion plans.

## Conclusion

Technological accumulation, specialization, and cross-border collaboration define the semiconductor industry. Advances in transistor architecture, lithography, materials, design tools, fabrication, and packaging depend on one another. No single segment determines the outcome on its own. Dedicated foundries separated design and manufacturing, while advanced packaging is bringing front-end and back-end work closer together again. AI has increased demand for advanced computing, but has also deepened dependence on HBM, interconnects, electricity, and software ecosystems.

Assessing a company or market requires comparable definitions and data. A market-share figure needs a time period, geography, product boundary, and measurement basis. An equipment price needs a model and year. A process node cannot be read as a literal physical dimension. Gross margins should be compared only under consistent accounting conventions. Unpublished yields, customer confidence, or future capacity should not be presented as established facts.

Over the next several years, competition will center on four capabilities: advancing device and system technologies; maintaining efficient volume production despite heavy capital spending; building auditable cross-border supply networks; and securing power, talent, and critical materials. Regionalization will increase the weight of compliance and redundancy in investment decisions without fully replacing global specialization. Companies that assess technology roadmaps, customer demand, capital discipline, and supply security together will be better placed to navigate both growth and cyclical volatility.

## References

### Historical Sources

[H01] Computer History Museum, “1954: Silicon Transistors Offer Superior Operating Characteristics.” <https://www.computerhistory.org/siliconengine/silicon-transistors-offer-superior-operating-characteristics/> Scope: Tanenbaum's 1954 device, Teal's laboratory-organizing role, Adcock's team leadership, commercial silicon transistors, and temperature performance. The later oxide-layer discussion uses [H17]; this 1954 page is not evidence for the separate 1957 Fairchild account.

[H02] Intel, “Moore’s Law.” <https://www.intel.com/content/www/us/en/newsroom/resources/moores-law.html>

[H03] Intel, “The Chip that Changed the World.” <https://www.intel.com/content/www/us/en/newsroom/opinion/chip-that-changed-world.html> Canonical destination of the former newsroom link. Supports the calculator origin and 1971 introduction; the four-bit and 2,300-transistor specifications are sourced separately to [H20].

[H04] U.S. International Trade Commission, “The South Korea-Japan Trade Dispute in Context: Semiconductor Manufacturing, Chemicals and Concentrated Supply Chains.” <https://usitc.gov/sites/default/files/publications/332/working_papers/semiconductor_working_paper_corrected_103119.pdf>

[H05] Intel, “Ingredient Branding: End User Marketing and Intel Inside.” <https://www.intel.com/content/www/us/en/history/virtual-vault/articles/end-user-marketing-intel-inside.html> Scope: the 1991 campaign launch and cooperative advertising model. It does not establish the separate 1985 DRAM exit, which is sourced to [H21].

[H06] Office of the United States Trade Representative, “1996 National Trade Estimate—Japan: Semiconductors.” <https://ustr.gov/archive/Document_Library/Reports_Publications/1996/1996_National_Trade_Estimate/1996_National_Trade_Estimate-Japan.html>

[H07] TSMC, “2025 Annual Report—About TSMC.” <https://investor.tsmc.com/static/annualReports/2025/english/index.html>

[H08] AMD, “AMD Reports Fourth Quarter and Annual Results,” January 21, 2010. <https://ir.amd.com/financial-information/sec-filings/content/0001193125-10-009806/dex991.htm>

[H09] ASML, “How Immersion Lithography Saved Moore’s Law,” 2023. <https://www.asml.com/en/company/stories/2023/how-immersion-lithography-saved-moores-law>

[H10] University of California, Berkeley EECS, “History.” <https://eecs.berkeley.edu/about/history/> Location: semiconductor-history paragraph naming Bokor, Hu, and King as FinFET collaborators. This institutional overview does not date the naming; [H13] supports the earlier Hitachi precursor and subsequent Berkeley development.

[H11] Intel, “Moore’s Law: Fun Facts.” <https://www.intel.com/content/www/us/en/history/history-moores-law-fun-facts-factsheet.html>

[H12] ASML, “EUV Lithography Systems.” <https://www.asml.com/en/products/euv-lithography-systems>

[H13] IEEE Technology Navigator, “FinFETs.” <https://technav.ieee.org/topic/finfets/> Location: “What Are FinFETs?” Supports the 1989 Hitachi DELTA precursor and the subsequent Berkeley development and naming, but not a precise late-1990s naming date.

[H14] Ministry of Economy, Trade and Industry of Japan, “2018 White Paper on International Economy and Trade—VLSI Project History.” <https://www.meti.go.jp/report/tsuhaku2018/2018honbun/i2220000.html>

[H15] John Bardeen and Walter H. Brattain, US 2,524,035, “Three-Electrode Circuit Element Utilizing Semiconductive Materials.” <https://patents.google.com/patent/US2524035A/en>

[H16] Jack S. Kilby, US 3,138,743, “Miniaturized Electronic Circuits.” <https://patents.google.com/patent/US3138743A/en>

[H17] Robert N. Noyce, US 2,981,877, “Semiconductor Device-and-Lead Structure.” <https://patents.google.com/patent/US2981877A/en>

[H18] Computer History Museum, “1947: Invention of the Point-Contact Transistor.” <https://www.computerhistory.org/siliconengine/invention-of-the-point-contact-transistor/>

[H19] ASML, “TSMC Selects ASML for Industry’s First Immersion Tool Order,” December 3, 2003. <https://www.asml.com/en/news/press-releases/2003/tsmc-selects-asml-for-industry-first-immersion-tool-order> Historical reference with an access limitation: the title and TSMC order statement were corroborated in search-indexed text, but the original URL redirected to ASML's generic press-release index on October 3, 2026. This is not a currently accessible live copy of the release, and no verified equivalent live replacement was found. The accessible 2023 retrospective [H09] provides immersion-history context; it does not independently establish the full 2003 order announcement.

[H20] Intel, “Celebrating the 50th Anniversary of the Intel 4004,” 2021 infographic (PDF), p. 1. <https://download.intel.com/newsroom/2021/data-center/4004-infographic.pdf> Location: 1971 comparison column. Supports the four-bit instruction-set description and 2,300-transistor count.

[H21] Intel, “Semiconductors and Intel: An Introduction” (PDF), p. 18, “Intel’s history in 4 fast eras.” <https://www.intel.com/content/dam/www/central-libraries/us/en/documents/semiconductors-and-intel-introduction.pdf> Location: 1985–1995 timeline. Supports the 1985 DRAM exit and 386 introduction; it is a separate source from the Intel Inside marketing history.

### Technology and Value-Chain Sources

[S01] ASML, “Lenses and Mirrors—Lithography Principles.” <https://www.asml.com/technology/lithography-principles/lenses-and-mirrors>

[S02] RISC-V International, “About RISC-V.” <https://riscv.org/about/>

[S03] Intel, “Intel 18A Process Technology Simply Explained,” January 30, 2025. <https://newsroom.intel.com/intel-foundry/intel-18a-process-technology-simply-explained>

[S04] Samsung Semiconductor, “3D V-NAND Flash Memory.” <https://semiconductor.samsung.com/support/tools-resources/dictionary/semiconductor-glossary-3d-v-nand-flash-memory/> Scope: vertically stacked NAND memory cells and their distinction from a single-layer arrangement. This glossary does not establish HBM's DRAM/base-die structure or CoWoS packaging; those claims use [S08] and [S07].

[S05] Automotive Electronics Council, “AEC-Q100: Failure Mechanism Based Stress Test Qualification for Integrated Circuits,” Rev J, August 11, 2023. [AEC-Q100 Rev J — manufacturer-hosted copy at Guerrilla RF (PDF)](https://www.guerrilla-rf.com/includes/pdfs/general/AEC_Q100_Rev_J_Base_Document.pdf). Location: §§1.3.1–1.3.3, printed p. 2 (PDF p. 8), on qualification, the absence of an AEC certification board, and user approval. The [AEC publisher documents index](https://www.aecouncil.com/AECDocuments.html) could not be retrieved during the October 3, 2026 review; that access failure does not establish deletion. The inspected copy is the AEC standard hosted by a manufacturer, not the publisher's live index, and does not establish which revision is currently latest.

[S06] Intel, “Postcard from Intel Technology Tour Arizona: Panther Lake Draws in Cameras and Crowds,” October 10, 2025. <https://www.intel.com/content/www/us/en/newsroom/news/client-computing/postcard-itt-panther-lake-draws-cameras-and-crowds.html>

[S07] TSMC, “CoWoS.” <https://3dfabric.tsmc.com/english/dedicatedFoundry/technology/cowos.htm> Location: technology overview and CoWoS-S/R/L descriptions. Supports the 2.5D integration of logic and HBM using silicon or redistribution-layer interposers; it is not a source for every form of 3D bonding.

[S08] SK hynix, “SK hynix Partners with TSMC to Strengthen HBM Technological Leadership,” April 19, 2024. <https://news.skhynix.com/en/sk-hynix-partners-with-tsmc-to-strengthen-hbm-technological-leadership/> Location: base-die paragraph and TSV/CoWoS explanatory notes. Supports the DRAM/base-die stack, TSV interconnections, and integration with a processor; cited for technical structure, not for promotional leadership claims or later production outcomes.

### Market and Company Sources

[M01] European Commission, Case M.11766, NVIDIA/Run:ai merger decision, December 20, 2024. <https://ec.europa.eu/competition/mergers/cases1/202516/M_11766_10599589_2740_3.pdf> Location: §4.2.1, Table 2 and paragraph 92, printed pp. 21–22 (PDF pp. 22–23). The market is worldwide discrete data-center GPUs by volume; the bracketed ranges cover 2021–2023 and H1 2024. Paragraph 92 records the notifying party NVIDIA's caution about the reliability of volume estimates derived from revenue and average purchase prices. That caution is attributed to NVIDIA, not presented as an independently established Commission finding.

[M02] TSMC, “2025 Annual Report.” <https://investor.tsmc.com/static/annualReports/2025/english/index.html>

[M03] ASML, “2025 Annual Report.” <https://www.asml.com/en/investors/annual-report/2025>

### Policy and Risk Sources

[R01] NIST, “Funding Updates.” <https://www.nist.gov/chips/funding-updates> Location: opening program-funding paragraph. Official fallback confirming Commerce's administration of US$50 billion in semiconductor incentives and R&D funding; this is an allocation, not cash already disbursed. Original provenance: [U.S. Department of Commerce, “Semiconductor Industry—CHIPS for America”](https://www.commerce.gov/issues/semiconductor-industry). Direct access to that Commerce page returned HTTP 403 during the October 3, 2026 review; it is access-blocked, not established to be deleted. The funding source does not independently establish the report's regionalization cost analysis.

[R02] European Commission, “Digital Sovereignty: European Chips Act Enters into Force,” September 21, 2023. <https://digital-strategy.ec.europa.eu/en/news/digital-sovereignty-european-chips-act-enters-force> Location: opening and paragraph stating the 20%-by-2030 goal. This dated release supports commencement and the historical policy target. The [current European Chips Act policy page](https://digital-strategy.ec.europa.eu/en/policies/european-chips-act) remains useful for policy context but no longer states that target in the version reviewed on October 3, 2026; it is not substituted for the dated evidence.

[R03] U.S. Bureau of Industry and Security, “Commerce Strengthens Restrictions on Advanced Computing Semiconductors,” January 15, 2025. <https://www.bis.gov/press-release/commerce-strengthens-restrictions-advanced-computing-semiconductors-enhance-foundry-due-diligence-prevent>

[R04] International Energy Agency, “Energy and AI,” April 10, 2025. <https://www.iea.org/reports/energy-and-ai>

[R05] European Commission, “Proposal for the Chips Act 2.0,” June 3, 2026. <https://digital-strategy.ec.europa.eu/en/library/proposal-chips-act-20>
