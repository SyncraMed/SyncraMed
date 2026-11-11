// Common prescription and over-the-counter medicine names (generic and brand). Used ONLY to repair names the camera
// reader got slightly wrong ("Jsinopril" -> "Lisinopril") and to throw out words that are not medicine names.
// Every name is still checked against RxNorm (NLM) when online, and the person always confirms it.
export const DRUG_NAMES: string[] = `
lisinopril atorvastatin levothyroxine metformin amlodipine metoprolol omeprazole simvastatin losartan albuterol gabapentin
hydrochlorothiazide sertraline furosemide acetaminophen fluticasone montelukast escitalopram rosuvastatin bupropion pantoprazole
trazodone tamsulosin prednisone fluoxetine carvedilol citalopram meloxicam clopidogrel pravastatin ibuprofen duloxetine venlafaxine
lamotrigine cyclobenzaprine tramadol zolpidem alprazolam clonazepam lorazepam diazepam warfarin apixaban rivaroxaban dabigatran
glipizide glimepiride glyburide pioglitazone sitagliptin empagliflozin dapagliflozin canagliflozin insulin glargine lispro aspart
semaglutide liraglutide dulaglutide atenolol propranolol bisoprolol nebivolol labetalol nadolol sotalol valsartan olmesartan
irbesartan telmisartan candesartan benazepril enalapril ramipril quinapril captopril fosinopril diltiazem verapamil nifedipine
felodipine clonidine hydralazine spironolactone chlorthalidone triamterene bumetanide torsemide isosorbide nitroglycerin digoxin
amiodarone flecainide propafenone ezetimibe fenofibrate gemfibrozil lovastatin pitavastatin niacin ranolazine sacubitril
ranitidine famotidine esomeprazole lansoprazole rabeprazole ondansetron promethazine metoclopramide loratadine cetirizine
levocetirizine fexofenadine diphenhydramine hydroxyzine meclizine amoxicillin clavulanate azithromycin clarithromycin ciprofloxacin
levofloxacin doxycycline minocycline cephalexin cefuroxime cefdinir sulfamethoxazole trimethoprim nitrofurantoin metronidazole
clindamycin penicillin fluconazole terbinafine acyclovir valacyclovir famciclovir oseltamivir ivermectin hydroxychloroquine
methotrexate prednisolone methylprednisolone dexamethasone hydrocortisone allopurinol colchicine febuxostat naproxen diclofenac
celecoxib etodolac nabumetone indomethacin ketorolac oxycodone hydrocodone morphine hydromorphone codeine buprenorphine naloxone
naltrexone methadone baclofen tizanidine methocarbamol carisoprodol metaxalone topiramate levetiracetam carbamazepine
oxcarbazepine phenytoin valproate divalproex lithium quetiapine olanzapine risperidone aripiprazole ziprasidone lurasidone
haloperidol paroxetine mirtazapine amitriptyline nortriptyline buspirone methylphenidate amphetamine dextroamphetamine
lisdexamfetamine atomoxetine guanfacine donepezil memantine ropinirole pramipexole carbidopa levodopa benztropine sumatriptan
rizatriptan finasteride dutasteride oxybutynin tolterodine solifenacin mirabegron sildenafil tadalafil estradiol
medroxyprogesterone norethindrone levonorgestrel progesterone alendronate risedronate raloxifene calcitriol cholecalciferol
ergocalciferol folic cyanocobalamin potassium magnesium ferrous budesonide tiotropium ipratropium salmeterol formoterol
mometasone beclomethasone zafirlukast theophylline guaifenesin benzonatate pseudoephedrine methimazole liothyronine doxazosin
terazosin prazosin aspirin ticagrelor prasugrel cilostazol pentoxifylline pregabalin temazepam eszopiclone ramelteon melatonin
lasix zocor lipitor crestor norvasc synthroid zoloft prozac lexapro celexa paxil xanax ativan klonopin valium ambien ultram
percocet vicodin norco flexeril mobic neurontin lyrica cymbalta effexor wellbutrin seroquel abilify zyprexa risperdal lamictal
keppra topamax depakote coumadin plavix eliquis xarelto brilinta glucophage januvia jardiance farxiga lantus ozempic trulicity
victoza singulair zyrtec claritin allegra benadryl flonase nexium prilosec protonix pepcid zofran amoxil zithromax cipro levaquin
bactrim keflex augmentin diflucan valtrex zovirax tamiflu plaquenil medrol toprol lopressor coreg tenormin diovan cozaar
benicar zestril prinivil vasotec altace lotensin cardizem procardia catapres aldactone microzide zestoretic hyzaar
advil motrin tylenol aleve excedrin pepto imodium tums zantac mucinex sudafed robitussin
`.split(/\s+/).filter(Boolean);

export const DRUG_SET = new Set(DRUG_NAMES);
