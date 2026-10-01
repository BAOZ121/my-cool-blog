---
title: "AI and Computing Infrastructure: Industry History, Value Chain, and Challenges"
description: "How AI computing became an infrastructure business, who supplies the value chain, and what determines delivery and investment returns."
date: 2026-10-01T21:45:00+08:00
lastmod: 2026-10-01
image: "cover.png"
categories:
  - "Industry Report"
  - "AI & Computing"
tags:
  - "AI"
  - "Computing Infrastructure"
  - "Industry Research Report"
draft: false
---


Sources current to October 1, 2026. This report covers the chips, servers, data centers and cloud services used for AI training and inference. Financial figures retain each company's reporting period and business scope. Supporting materials appear in a separate appendix outside Parts 1 to 4.

AI services depend on a chain of suppliers and operators that turn equipment into usable computing capacity. This report follows an order through that chain, traces how the industry developed, identifies representative companies, and examines the constraints on delivery and investment returns.

## Part 1: Story

In September 2026, Dell reported results for the fiscal quarter ended July 31. AI-optimized server revenue was $16.4 billion, new orders totaled $60.9 billion, and the quarter ended with a $95 billion backlog.<sup><a href="#evidence-23" aria-label="Source 23">[23]</a></sup> Revenue represents business recognized during the quarter, orders reflect newly booked demand, and backlog is the stock still awaiting delivery. Converting that backlog into revenue requires production and delivery to be completed.

Much has to happen between an order and a working installation. Server vendors need accelerators, memory and networking components to arrive, then must test the assembled systems. Customers need sites with suitable power and cooling. A delay at one stage can push back the deployment schedule. For the customer, receiving the equipment is only one step in the project.

Once a cluster is running, the operating questions change. Users care less about how many chips it contains than whether its answers are useful and arrive quickly enough. Service providers must handle more paid requests while meeting those expectations, because depreciation, electricity bills and staffing costs continue. The capabilities promised at purchase have to be delivered in everyday operation.

AI infrastructure connects businesses that can otherwise look quite different. Chip design, manufacturing, system delivery and cloud services all respond to the same underlying demand. Understanding the industry means following an order through to the point where computing capacity is used and customers continue paying for it. The formation of this value chain begins with much earlier changes in research and engineering.

## Part 2: Industry History

### 1. From research questions to commercial experiments

In 1943, McCulloch and Pitts proposed a mathematical model of neural activity. In 1950, Alan Turing examined machine intelligence and introduced the 'imitation game'. The term 'artificial intelligence' appeared in the 1955 proposal for the Dartmouth research project, which took place in the summer of 1956. The first question was whether ideas about intelligence could be turned into programs a computer could execute.<sup><a href="#evidence-1" aria-label="Source 1">[1]</a></sup>

Early programs made progress on well-defined problems but often failed when faced with the complexity of the real world. In the 1970s, disappointed research expectations were followed by cuts in funding. Expert systems, which rose to prominence in the 1980s, encoded domain knowledge as rules but were subsequently constrained by maintenance costs and limited adaptability. Specialized Lisp computers also faced competition from cheaper general-purpose workstations. Both downturns exposed the distance between a technical demonstration and a commercially sustainable application.<sup><a href="#evidence-2" aria-label="Source 2">[2]</a></sup>

In 1997, IBM's Deep Blue defeated Garry Kasparov in a six-game match. It combined specialized search chips, parallel computing, evaluation functions and databases of chess games to solve a clearly defined problem. The principle of designing a system around a task can still be seen in later AI infrastructure.<sup><a href="#evidence-3" aria-label="Source 3">[3]</a></sup>

### 2. GPUs and cloud computing improve access

GPUs can perform many similar operations at once, making them well suited to much of the computation in neural networks. NVIDIA introduced the CUDA architecture in 2006 and made related development tools available in 2007. Researchers gained not only faster chips but also programming tools they could put to work. Around the same time, AWS launched its S3 storage and EC2 computing services in 2006, allowing developers to rent infrastructure.<sup><a href="#evidence-4" aria-label="Source 4">[4]</a></sup><sup><a href="#evidence-5" aria-label="Source 5">[5]</a></sup>

AlexNet provided a clear example of the change in 2012. The individual network described in the paper took about five to six days to train on two GTX 580 GPUs. The team's ensemble of models achieved a top-5 test error rate of 15.3% in the ImageNet competition, compared with 26.2% for the runner-up. This error rate measures the share of cases in which the correct category did not appear among the five highest-ranked answers. GPUs, labeled data, network design and training methods all contributed to the breakthrough.<sup><a href="#evidence-6" aria-label="Source 6">[6]</a></sup>

### 3. Larger training runs change system design

In 2018, OpenAI analyzed large training runs carried out since 2012. It found that the amount of compute used in the largest runs in its sample had doubled roughly every 3.4 months, increasing by more than 300,000 times overall. This was a historical change in resources devoted to training. It was not a growth rate for model capabilities, and it cannot simply be extrapolated to the present.<sup><a href="#evidence-7" aria-label="Source 7">[7]</a></sup>

Hardware and algorithms were both changing. NVIDIA introduced Tensor Cores with its Volta architecture in 2017 to accelerate matrix operations. Google's first-generation TPU, deployed from 2015, was designed primarily for inference: applying an already-trained model to new inputs. The 2017 Transformer paper demonstrated greater training parallelism in its machine-translation experiments and provided an architectural foundation for later language models.<sup><a href="#evidence-8" aria-label="Source 8">[8]</a></sup><sup><a href="#evidence-9" aria-label="Source 9">[9]</a></sup><sup><a href="#evidence-10" aria-label="Source 10">[10]</a></sup>

GPT-3, introduced in 2020, had 175 billion parameters. ChatGPT's release in 2022 brought conversational models to a much wider audience. Demand acquired an additional dimension: systems had to handle a continuous stream of user requests as well as complete training runs.<sup><a href="#evidence-11" aria-label="Source 11">[11]</a></sup>

### 4. Computing becomes a data center engineering problem

Meta's 2024 Llama 3 report described using up to approximately 16,000 H100 GPUs to train its 405-billion-parameter model and discussed networking, storage and fault recovery in detail. As the number of machines grows, communication delays and downtime become more costly.<sup><a href="#evidence-12" aria-label="Source 12">[12]</a></sup>

Cooling must keep pace with increasing system density. The GB200 NVL72 uses a liquid-cooled rack, while the H100 product range still includes air-cooled configurations. The choice depends on power consumption and deployment conditions. Software also changes how efficiently equipment is used: the PagedAttention study demonstrated that better GPU memory management could improve inference throughput under the conditions tested.<sup><a href="#evidence-13" aria-label="Source 13">[13]</a></sup><sup><a href="#evidence-14" aria-label="Source 14">[14]</a></sup>

Power supply further constrains where a project can be built and when it can enter service. In its 2026 report, the International Energy Agency estimated global data center electricity consumption at approximately 485 terawatt-hours in 2025 and forecast approximately 950 terawatt-hours in 2030. These figures include non-AI uses. Operators must then answer a set of practical questions: when will the equipment go live, how many customers can it serve, and how long will it take to recover the investment?<sup><a href="#evidence-15" aria-label="Source 15">[15]</a></sup>

## Part 3: Value Chain

{{< industry-map id="ai-computing-infrastructure" >}}

### 1. Working back from the customer's bill

The value chain ends with the user of computing capacity. A business might rent GPUs by the hour or pay for model services according to usage. At sufficient scale, it may build its own cluster. Cloud providers collect service fees and spend a portion on servers, networking, electricity and operations. Server suppliers buy accelerators, memory and other components, while chip designers purchase manufacturing services from foundries and packaging providers. This is a simplified account of a typical division of work. Actual contracts may also involve large customers buying components directly and commissioning their integration.

The same end-customer demand generates revenue for several companies along the chain. Chip sales, server sales and cloud revenue therefore cannot simply be added together to calculate market size. When examining a particular stage, identifying the customer, the product or service delivered and the point at which revenue is recognized is more useful than starting with a single figure for the entire industry.

The table identifies representative companies by what they deliver. A company may participate at several stages; the list is not a market-share ranking.

| Value chain stage | Representative companies | Business role and sources |
| --- | --- | --- |
| Accelerators and software | {{< company id="nvidia" name="NVIDIA" >}}, {{< company id="amd" name="AMD" >}}, {{< company id="huawei" name="Huawei" >}} | NVIDIA supplies GPUs and CUDA; AMD offers Instinct products; Huawei provides the Ascend platform and CANN.<sup><a href="#evidence-4" aria-label="Source 4">[4]</a></sup><sup><a href="#evidence-18" aria-label="Source 18">[18]</a></sup><sup><a href="#evidence-19" aria-label="Source 19">[19]</a></sup><sup><a href="#evidence-27" aria-label="Source 27">[27]</a></sup> |
| Cloud provider chips | {{< company id="aws" name="AWS" >}}, {{< company id="google" name="Google" >}} | Develop Trainium and TPU respectively, configuring compute for internal and customer workloads.<sup><a href="#evidence-21" aria-label="Source 21">[21]</a></sup><sup><a href="#evidence-22" aria-label="Source 22">[22]</a></sup> |
| Fabrication and advanced packaging | {{< company id="tsmc" name="TSMC" >}}, {{< company id="ase" name="ASE" >}} | TSMC provides wafer fabrication and CoWoS; ASE supplies advanced packaging including 2.5D/3D integration.<sup><a href="#evidence-16" aria-label="Source 16">[16]</a></sup><sup><a href="#evidence-29" aria-label="Source 29">[29]</a></sup> |
| HBM memory | {{< company id="sk-hynix" name="SK hynix" >}}, {{< company id="micron" name="Micron" >}}, {{< company id="samsung" name="Samsung" >}} | Supply high-bandwidth memory, providing accelerators with data capacity and transfer bandwidth.<sup><a href="#evidence-17" aria-label="Source 17">[17]</a></sup><sup><a href="#evidence-30" aria-label="Source 30">[30]</a></sup><sup><a href="#evidence-31" aria-label="Source 31">[31]</a></sup> |
| Networking and interconnects | {{< company id="nvidia" name="NVIDIA" >}}, {{< company id="broadcom" name="Broadcom" >}} | Supply data center networking products and chips that connect servers and computing nodes.<sup><a href="#evidence-18" aria-label="Source 18">[18]</a></sup><sup><a href="#evidence-20" aria-label="Source 20">[20]</a></sup> |
| Servers and integration | {{< company id="dell" name="Dell" >}}, {{< company id="supermicro" name="Supermicro" >}} | Integrate accelerators and other components into AI servers, with air-cooled and liquid-cooled system formats.<sup><a href="#evidence-23" aria-label="Source 23">[23]</a></sup><sup><a href="#evidence-32" aria-label="Source 32">[32]</a></sup> |
| Power and cooling | {{< company id="vertiv" name="Vertiv" >}}, {{< company id="schneider-electric" name="Schneider Electric" >}} | Supply power, thermal management and supporting data center infrastructure.<sup><a href="#evidence-24" aria-label="Source 24">[24]</a></sup><sup><a href="#evidence-33" aria-label="Source 33">[33]</a></sup> |
| Cloud computing services | {{< company id="aws" name="AWS" >}}, {{< company id="azure" name="Microsoft Azure" >}}, {{< company id="google-cloud" name="Google Cloud" >}}, {{< company id="coreweave" name="CoreWeave" >}} | Deliver computing capacity and related services to customers and operate the underlying clusters.<sup><a href="#evidence-5" aria-label="Source 5">[5]</a></sup><sup><a href="#evidence-25" aria-label="Source 25">[25]</a></sup><sup><a href="#evidence-26" aria-label="Source 26">[26]</a></sup><sup><a href="#evidence-34" aria-label="Source 34">[34]</a></sup> |

### 2. Chip design and software

Accelerator design determines how computing units, on-chip memory and interconnects work together. Software determines whether models can use those resources. CUDA offers one way to understand this relationship: development tools, libraries and accumulated code affect the engineering work required to move to different hardware.<sup><a href="#evidence-4" aria-label="Source 4">[4]</a></sup> On that basis, this report argues that a chip should be assessed not only on performance and price, but also on the time needed to migrate models, debug them and achieve stable operation.

General-purpose GPUs can accommodate changing models and customer requirements. Large cloud providers are also in a position to develop specialized chips for more clearly defined workloads. AWS announced general availability of Trainium3 UltraServers in December 2025. Google introduced the TPU 8t and 8i for different workloads in April 2026. The former was an availability announcement; the latter was a product announcement. Neither establishes how many systems have actually been deployed.<sup><a href="#evidence-21" aria-label="Source 21">[21]</a></sup><sup><a href="#evidence-22" aria-label="Source 22">[22]</a></sup>

This creates two different commercial choices: selling chips and using chips to provide services. Whether an in-house chip pays off depends on how widely development costs can be spread, as well as performance, utilization and operating costs after migration. Cloud providers have an incentive to reduce the cost of serving each unit of demand. External customers are more concerned with whether their workloads run successfully.

### 3. Manufacturing advanced packaging and memory

Once a chip is designed, it must pass through wafer fabrication, packaging and testing. Advanced packaging is taking on more work. TSMC's CoWoS, for example, connects logic chips and high-bandwidth memory within the same packaging system. In its second-quarter 2026 earnings call, TSMC said packaging capacity remained tight. More wafer supply does not automatically mean complete accelerators can be delivered on time.<sup><a href="#evidence-16" aria-label="Source 16">[16]</a></sup>

HBM is high-bandwidth memory placed close to the computing chip. Capacity determines how much data it can hold, while bandwidth affects how quickly data moves. One cannot substitute for the other. Micron's published specifications for its 12-high HBM4 product, for example, list 36 GB of capacity and bandwidth exceeding 2.8 TB/s. These are component specifications; they cannot be converted directly into the amount of text a server generates per second.<sup><a href="#evidence-17" aria-label="Source 17">[17]</a></sup>

Constraints at this stage travel through the supply chain. Delays in computing chips, HBM or packaging can each hold up system shipments. Capacity expansion, meanwhile, requires upfront spending. The corresponding additional revenue generally cannot be recognized until the new capacity is ready and products have been delivered. Assessing business conditions therefore requires looking at demand, construction progress and yields together, rather than relying on expansion announcements alone.

### 4. Networks and server integration

Large training clusters must exchange data between computing nodes while continuously reading training material from storage.<sup><a href="#evidence-12" aria-label="Source 12">[12]</a></sup> Assessing a system therefore requires measuring how much time is spent on communication and data access. A single chip's peak computing performance does not capture these issues.

Server vendors and system integrators combine accelerators, CPUs, memory, networking and cooling into deliverable products. They also handle testing, deployment and after-sales service. Revenue can grow rapidly, but the funding needed for procurement, inventory commitments and delivery obligations rise with it.

### 5. Power cooling and cloud operations

Data centers need power distribution, backup power, cooling equipment and routine maintenance. Buying servers does not by itself provide usable computing capacity: sites, grid connections and installation must also be ready. Vertiv supplies infrastructure including power and thermal-management systems. It reported approximately $3.274 billion in sales in the second quarter of 2026. That figure indicates the scale of one supplier's business; it cannot all be classified as revenue from liquid cooling for AI.<sup><a href="#evidence-24" aria-label="Source 24">[24]</a></sup>

Once systems are operating, utilization and pricing become central. Training customers may occupy large amounts of equipment for a defined period, while inference services must respond to changing request volumes and latency requirements. Under the same requirements for answer quality and waiting time, the number of requests each machine can handle is a measure of efficiency closer to what operators need. Software optimization and standardized testing provide ways to make such comparisons.<sup><a href="#evidence-14" aria-label="Source 14">[14]</a></sup><sup><a href="#evidence-28" aria-label="Source 28">[28]</a></sup>

The operating economics can be expressed as a straightforward calculation: service revenue must cover equipment depreciation, financing, electricity, premises, networking and operating costs. Even as new chips become faster, older equipment may still serve less demanding tasks. But falling rental prices or low utilization will lengthen the payback period. End customers' willingness to pay determines whether expansion further up the chain can produce recurring revenue.

## Part 4: Industry Challenges

### 1. Supply constraints and delivery schedules

Advanced manufacturing, packaging, memory and grid connections constrain different stages of delivery. TSMC's disclosure of tight packaging capacity shows that constraints can arise after wafer fabrication. The power bottlenecks discussed by the IEA show that construction obstacles remain even after equipment leaves the factory.<sup><a href="#evidence-16" aria-label="Source 16">[16]</a></sup><sup><a href="#evidence-15" aria-label="Source 15">[15]</a></sup> This report's assessment is that a shortage at a particular stage may give its suppliers greater pricing power, but that advantage must be reassessed as supply expands and customer demand changes.

Capacity takes time to build, while chip generations and customer workloads can change during construction. A shortage today does not guarantee strong utilization once an expansion is complete. Buyers need to assess delivery dates and readiness across the whole project; suppliers need to judge whether demand will persist when their new capacity comes online.

### 2. Revenue growth and investment returns

The table below selects public figures from different stages of the value chain to show where demand is turning into revenue. Companies differ in fiscal periods, product scope and revenue recognition. These figures therefore do not rank shares of a single market. All amounts are in billions of US dollars and represent disclosed quarterly revenue; orders and forecasts are excluded.

| Company / business | Period ended | Quarterly revenue ($bn) | Scope and source |
| --- | --- | --- | --- |
| {{< company id="nvidia" name="NVIDIA" >}} Data Center | 2026-07-26 | 89.0 | Includes computing and networking; not GPU revenue alone.<sup><a href="#evidence-18" aria-label="Source 18">[18]</a></sup> |
| {{< company id="amd" name="AMD" >}} Data Center | 2026-06-27 | 6.7 | Includes EPYC CPUs and Instinct GPUs.<sup><a href="#evidence-19" aria-label="Source 19">[19]</a></sup> |
| {{< company id="broadcom" name="Broadcom" >}} AI semiconductors | 2026-08-02 | 16.7 | Includes custom accelerators and AI networking.<sup><a href="#evidence-20" aria-label="Source 20">[20]</a></sup> |
| {{< company id="tsmc" name="TSMC" >}}, company-wide | 2026-06-30 | 40.20 | Includes non-AI demand, such as smartphones.<sup><a href="#evidence-16" aria-label="Source 16">[16]</a></sup> |
| {{< company id="dell" name="Dell" >}} AI-optimized servers | 2026-07-31 | 16.4 | Recognized server revenue.<sup><a href="#evidence-23" aria-label="Source 23">[23]</a></sup> |
| {{< company id="vertiv" name="Vertiv" >}}, company-wide | 2026-06-30 | Approx. 3.274 | Includes infrastructure and services for non-AI uses.<sup><a href="#evidence-24" aria-label="Source 24">[24]</a></sup> |
| {{< company id="google-cloud" name="Google Cloud" >}} | 2026-06-30 | 24.768 | Includes revenue from GCP, Workspace and other products.<sup><a href="#evidence-25" aria-label="Source 25">[25]</a></sup> |
| {{< company id="coreweave" name="CoreWeave" >}}, company-wide | 2026-06-30 | 2.575 | Company revenue, including cloud services.<sup><a href="#evidence-26" aria-label="Source 26">[26]</a></sup> |

NVIDIA offers a view of revenue concentration within one company. In the quarter ended July 26, 2026, Data Center revenue was approximately $89.0 billion against total company revenue of $96.221 billion. Data Center therefore represented approximately 92.5% of NVIDIA's revenue, with other businesses accounting for the remaining 7.5%. These calculated percentages describe NVIDIA's revenue mix; Data Center includes computing and networking, and the figures do not measure AI revenue alone or NVIDIA's share of the industry.<sup><a href="#evidence-18" aria-label="Source 18">[18]</a></sup>

{{< market-share id="nvidia-revenue-mix-fy2027-q2" >}}

Differences in scale do not establish which business model is more profitable. Chip design, wafer fabrication, complete-system delivery and cloud operations carry different costs. Assessing the quality of a business also requires examining gross profit, capital expenditure, cash flow and asset utilization. In particular, business revenue that includes CPUs or enterprise productivity services cannot all be counted as AI accelerator or model-service revenue.

Contract value is no substitute for profitability. In the second quarter of 2026, CoreWeave reported revenue of $2.575 billion alongside a GAAP net loss of $0.626 billion. Its approximately $104 billion quarter-end revenue backlog included remaining performance obligations and estimated future revenue under other contracts. Realization remained subject to conditions including delivery and service availability.<sup><a href="#evidence-26" aria-label="Source 26">[26]</a></sup> These figures place growth and cost pressures on the same set of accounts.

### 3. Platform choice and software migration

The first approach is to build a hardware and software platform around accelerators. NVIDIA's business now spans computing and networking, while AMD supplies both data center CPUs and accelerators. The second is for cloud providers to develop chips around their own workloads, then supply computing capacity to internal operations or external customers. Products from AWS and Google illustrate this approach. The third is to provide custom accelerators and networking chips for large customers. Broadcom's disclosed AI semiconductor revenue falls into this category.<sup><a href="#evidence-18" aria-label="Source 18">[18]</a></sup><sup><a href="#evidence-19" aria-label="Source 19">[19]</a></sup><sup><a href="#evidence-20" aria-label="Source 20">[20]</a></sup><sup><a href="#evidence-21" aria-label="Source 21">[21]</a></sup><sup><a href="#evidence-22" aria-label="Source 22">[22]</a></sup>

All three approaches can appear on a single customer's purchasing list. An established platform is attractive when models are still changing and there is little time for migration. Specialized designs become more attractive when workloads are stable enough and usage is sufficiently large. This report therefore expects competition to center on workloads, software compatibility and total cost of use. A single chip metric is unlikely to determine the outcome.

Competition in China’s market also involves software. Huawei's documentation positions CANN, its heterogeneous computing architecture, between AI frameworks and Ascend hardware, covering functions such as compilation, operators and runtime execution.<sup><a href="#evidence-27" aria-label="Source 27">[27]</a></sup> Assessing a platform therefore requires looking beyond chip specifications to whether existing models can be migrated, which operators need rewriting and how easily the tools support debugging.

### 4. Hardware specifications and actual service costs

A useful system comparison starts with the same task. The model, precision, quality target and latency requirements need to be specified before throughput is compared. MLPerf’s inference benchmarks use defined scenarios and quality requirements for this reason.<sup><a href="#evidence-28" aria-label="Source 28">[28]</a></sup> A chip specification or a result from one workload cannot establish the operating performance of every deployment.

For operators, the next step is to connect those measurements to the bill. The same number of installed machines can produce different costs per completed request if utilization, downtime or software efficiency differs. Evaluation therefore needs to include deployment work, power, maintenance and the amount of capacity customers actually use.

### 5. Whether paid usage can sustain expansion

On the demand side, watch whether paid usage keeps pace with capacity additions. On the supply side, track whether advanced packaging, memory and power projects are delivered on schedule. For operating performance, examine utilization, cash flow and investment payback periods. These measures are connected: delivery delays can hold back real customer demand, while fully installed equipment can still face falling prices and low utilization.

AI infrastructure now links model development with manufacturing, engineering and ongoing operations. Companies that deliver reliably, enable customers to use their products or services successfully, and cover costs while generating recurring cash flow at their own stage of the chain have an opportunity to turn a wave of purchasing into a lasting business. That is this report's overall assessment of the value chain; actual delivery and financial results will be needed to test it.

## Appendix: Supporting Materials

Source numbers correspond to the citations in the article. The appendix is separate from Parts 1 to 4.

<h3 id="evidence-1">[1] Early AI documents</h3>

- [McCulloch & Pitts (1943) — A Logical Calculus of the Ideas Immanent in Nervous Activity](https://doi.org/10.1007/BF02478259)

- [Turing (1950) — Computing Machinery and Intelligence](https://www.cs.toronto.edu/~frank/csc2501/Readings/R1_Turing/Turing-1950.pdf)

- [McCarthy et al. (1955) — Dartmouth research proposal](https://www-formal.stanford.edu/jmc/history/dartmouth/dartmouth.html)

- [Dartmouth — Artificial Intelligence Coined at Dartmouth](https://home.dartmouth.edu/about/artificial-intelligence-ai-coined-dartmouth)

Location: Turing, pp. 433–434; opening of the Dartmouth proposal; Dartmouth history page. Original papers and institutional records.

<h3 id="evidence-2">[2] AI winters and expert systems</h3>

- [Ted E. Senator (2026) Implications for AI Research: Applying Lessons from the Expert Systems Boom and Bust to the Current Large-Language Model Boom](https://ojs.aaai.org/index.php/AAAI/article/view/41334/45295)

Location: PDF pp. 1–2. A retrospective scholarly paper.

<h3 id="evidence-3">[3] Deep Blue</h3>

- [Campbell, Hoane & Hsu (2002) — Deep Blue](https://research.ibm.com/publications/deep-blue)

Location: IBM paper abstract. An account by the project researchers.

<h3 id="evidence-4">[4] GPUs and CUDA</h3>

- [NVIDIA CUDA Programming Guide — Introduction](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/introduction.html)

- [NVIDIA CPU vs GPU — What’s the Difference](https://blogs.nvidia.com/blog/whats-the-difference-between-a-cpu-and-a-gpu/)

Location: guide introduction and official historical account. Distinguishes the 2006 architecture introduction from the 2007 software release.

<h3 id="evidence-5">[5] Early AWS services</h3>

- [AWS Our Origins](https://aws.amazon.com/about-aws/our-origins/)

Location: paragraphs on the launch of S3 and EC2. Official historical account.

<h3 id="evidence-6">[6] AlexNet</h3>

- [Krizhevsky, Sutskever & Hinton (2012) — ImageNet Classification with Deep Convolutional Neural Networks](https://proceedings.neurips.cc/paper/4824-imagenet-classification-with-deep-convolutional-neural-networks.pdf)

Location: Sections 3 and 6, Table 2. Training hardware refers to an individual network; the competition score is for an ensemble.

<h3 id="evidence-7">[7] Historical training compute</h3>

- [Amodei & Hernandez / OpenAI (2018) — AI and Compute](https://openai.com/index/ai-and-compute/)

Location: opening and Overview. Original 2018 analysis of its historical sample.

<h3 id="evidence-8">[8] Volta and Tensor Cores</h3>

- [NVIDIA (2017) NVIDIA Launches Revolutionary Volta GPU Platform](https://nvidianews.nvidia.com/news/nvidia-launches-revolutionary-volta-gpu-platform-fueling-next-era-of-ai-and-high-performance-computing)

Official announcement, 2017-05-10. Used for the launch date and matrix-computation function.

<h3 id="evidence-9">[9] First-generation TPU</h3>

- [Jouppi et al. (2017) — In-Datacenter Performance Analysis of a Tensor Processing Unit](https://research.google/pubs/in-datacenter-performance-analysis-of-a-tensor-processing-unit/)

Location: paper abstract. Supports deployment in 2015 and its inference role.

<h3 id="evidence-10">[10] Transformer</h3>

- [Vaswani et al. (2017) — Attention Is All You Need](https://arxiv.org/abs/1706.03762)

Location: abstract and Section 4. Findings relate to the paper’s machine-translation experiments.

<h3 id="evidence-11">[11] GPT-3 and ChatGPT</h3>

- [Brown et al. (2020) — Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165)

- [OpenAI (2022) — Introducing ChatGPT](https://openai.com/index/chatgpt/)

Location: GPT-3 abstract and ChatGPT launch page. A model paper and the product announcement of 2022-11-30, respectively.

<h3 id="evidence-12">[12] Llama 3 training cluster</h3>

- [Meta Llama Team (2024) — The Llama 3 Herd of Models](https://arxiv.org/html/2407.21783v3)

Location: Sections 3.3.1–3.3.4. An engineering example from a particular training project.

<h3 id="evidence-13">[13] Cooling configurations</h3>

- [NVIDIA — GB200 NVL72 product information](https://www.nvidia.com/en-us/data-center/gb200-nvl72/)

- [NVIDIA — H100 product specifications](https://www.nvidia.com/en-us/data-center/h100/)

Location: GB200 NVL72 rack description and H100 Form Factor specification. Evidence for the named product configurations.

<h3 id="evidence-14">[14] PagedAttention</h3>

- [Kwon et al. (2023) — Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180)

Location: abstract and evaluation. Throughput findings depend on the tested models, workloads and latency constraints.

<h3 id="evidence-15">[15] Data center electricity</h3>

- [IEA (2026) — Key Questions on Energy and AI: Executive Summary](https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary)

Institutional report, 2026-04-16; executive summary. 485 TWh is a 2025 estimate and 950 TWh a 2030 forecast; both include non-AI uses.

<h3 id="evidence-16">[16] TSMC: fabrication and packaging</h3>

- [TSMC — CoWoS technology](https://3dfabric.tsmc.com/english/dedicatedFoundry/technology/cowos.htm)

- [TSMC — 2Q26 results presentation (2026-07-16)](https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-07/0e4d9625c9ef46521afd54002f835e45a9035043/2Q26%20Presentation%20(E).pdf)

- [TSMC — 2Q26 earnings-call transcript](https://investor.tsmc.com/english/encrypt/files/encrypt_file/reports/2026-08/3e494f0c14dd0890f897aa044415e21d93486cc4/TSMC%202Q26%20Transcript.pdf)

Location: technology page; presentation p. 4; call transcript p. 10. Revenue is company-wide; the packaging constraint is management’s assessment at that time.

<h3 id="evidence-17">[17] HBM product specifications</h3>

- [Micron — HBM4](https://www.micron.com/products/memory/hbm/hbm4)

Location: specifications for the 12-high product. Capacity and bandwidth are supplier component specifications, not measured server performance.

<h3 id="evidence-18">[18] NVIDIA quarterly revenue</h3>

- [NVIDIA — Q2 fiscal 2027 results (2026-08-26)](https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-second-quarter-fiscal-2027)

Location: Data Center discussion and the quarter ended 2026-07-26. The revenue covers computing, networking and other products in that business.

<h3 id="evidence-19">[19] AMD quarterly revenue</h3>

- [AMD — Q2 2026 financial results (2026-08-04)](https://ir.amd.com/news-events/press-releases/detail/1295/amd-reports-second-quarter-2026-financial-results)

Location: Data Center discussion; quarter ended 2026-06-27. The segment includes server CPUs and GPUs.

<h3 id="evidence-20">[20] Broadcom quarterly revenue</h3>

- [Broadcom — Q3 fiscal 2026 results (2026-09-02)](https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announces-third-quarter-fiscal-year-2026-financial)

Location: AI semiconductor revenue discussion; quarter ended 2026-08-02. Uses reported revenue, not guidance for the following quarter.

<h3 id="evidence-21">[21] AWS custom silicon</h3>

- [AWS — Amazon EC2 Trn3 UltraServers availability (2025-12-02)](https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-ec2-trn3-ultraservers/)

Official availability announcement. Supports availability, not deployment volume or market share.

<h3 id="evidence-22">[22] Google TPU products</h3>

- [Google — Introducing TPU 8t and TPU 8i (2026-04-22)](https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/tpus-8t-8i-cloud-next/)

Official product introduction. Supports workload specialization, not general availability or installed volumes.

<h3 id="evidence-23">[23] Dell: revenue, orders and backlog</h3>

- [Dell — Q2 fiscal 2027 financial results (2026-09-01)](https://investors.delltechnologies.com/news-releases/news-release-details/dell-technologies-delivers-second-quarter-fiscal-2027-financial)

Location: AI server commentary and the quarter ended 2026-07-31. Revenue, orders and backlog are cited as separate measures.

<h3 id="evidence-24">[24] Vertiv: power and thermal management</h3>

- [Vertiv — Q2 2026 results, SEC Exhibit 99.1 (2026-07-29)](https://www.sec.gov/Archives/edgar/data/1674101/000162828026050323/q22026exhibit991vrt07292026.htm)

Location: net sales and company description; quarter ended 2026-06-30. Figures are company-wide.

<h3 id="evidence-25">[25] Google Cloud revenue scope</h3>

- [Alphabet — Q2 2026 earnings release (2026-07-22)](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm)

- [Alphabet — Form 10-Q, quarter ended 2026-06-30](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/goog-20260630.htm)

Location: release segment-revenue table; Google Cloud in the 10-Q revenue-recognition discussion. Includes cloud services, subscriptions and product sales.

<h3 id="evidence-26">[26] CoreWeave: growth and operating costs</h3>

- [CoreWeave — Q2 2026 earnings release (2026-08-11)](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000362/coreweave2q26earningspress.htm)

Location: highlights, revenue-backlog definition and income statement; quarter ended 2026-06-30. Net loss is GAAP; backlog is not cash received.

<h3 id="evidence-27">[27] Ascend software architecture</h3>

- [Huawei — CANN Community Edition 8.5.0 documentation](https://www.hiascend.com/doc_center/source/zh/CANNCommunityEdition/850/index/index.html)

Location: CANN architecture and functionality. Technical documentation, not comparable market-share evidence.

<h3 id="evidence-28">[28] Conditions for inference comparisons</h3>

- [MLCommons — MLPerf Inference: Datacenter](https://mlcommons.org/benchmarks/inference-datacenter/)

Location: benchmark description, scenarios and quality requirements. Used for comparison principles, not vendor rankings.

<h3 id="evidence-29">[29] ASE advanced packaging</h3>

- [ASE — VIPack™](https://ase.aseglobal.com/VIPack/)

Location: VIPack overview and six packaging technology pillars, especially the passages on 2.5D/3D architectures and HBM interconnects.

<h3 id="evidence-30">[30] SK hynix high bandwidth memory</h3>

- [SK hynix Begins Volume Production of Industry’s First HBM3E (2024-03-19)](https://news.skhynix.com/en/sk-hynix-begins-volume-production-of-industry-first-hbm3e/)

Location: Opening paragraph of the 19 March 2024 release, the HBM definition and the discussion of AI processor–memory interconnections.

<h3 id="evidence-31">[31] Samsung high bandwidth memory</h3>

- [Samsung Semiconductor — HBM](https://semiconductor.samsung.com/dram/hbm/)

Location: HBM overview describing TSV stacking, AI training and HPC; used to establish business scope, not customer qualification or market share.

<h3 id="evidence-32">[32] Supermicro GPU servers</h3>

- [Supermicro — GPU Servers for AI, Deep / Machine Learning & HPC](https://www.supermicro.com/en/products/gpu)

Location: The Liquid Cooled GPU Systems and Air Cooled GPU Systems categories under Supermicro GPU Servers.

<h3 id="evidence-33">[33] Schneider Electric data center infrastructure</h3>

- [Schneider Electric — AI Data Centers e-guide (2026-02-11)](https://www.se.com/us/en/download/document/998-2372985_AI_Ready_DC/)

Location: Opening portfolio description on the guide download page; version 1.5, document 998-2372985_AI_Ready_DC.

<h3 id="evidence-34">[34] Microsoft Azure accelerated computing</h3>

- [Microsoft Azure — Virtual Machine series](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/series/)

Location: The N Family — GPU accelerated virtual machines section, including the roles of the ND, NC and NV series.

Brand icon sources and licenses are listed in the [asset credits](asset-credits.txt).
