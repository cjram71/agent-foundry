const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const companyId = 'BSTA-COMP-001';
const workspaceId = 'BSTA-WORKSPACE-001';
const owner = 'founder';
const roles = [
  ['distribution','Distribution Agent','Retail metadata, retailer checklists, submission follow-up'],
  ['editorial-copy','Editorial/Copy Agent','Retailer-ready descriptions and Swedish copy drafts'],
  ['website-conversion','Website Conversion Agent','Trust, conversion, CTA and mobile recommendations'],
  ['operations-email','Operations/Email Agent','Consent-safe email capture and welcome sequences'],
  ['analytics','Analytics Agent','Funnel, attribution and weekly performance analysis'],
  ['marketing','Marketing Agent','Approved experiment plans and cost-per-result analysis'],
  ['reviewer','Reviewer Agent','Evidence-based weekly review and Company Brain recommendations']
];
const taskSets = [
  ['distribution','Collect missing book metadata and retailer submission checklists'],
  ['trust-conversion','Audit website trust and conversion baseline'],
  ['email-capture','Compare Brevo and Mailchimp and design consent-safe capture'],
  ['analytics','Instrument funnel events and conversion reporting'],
  ['paid-marketing','Prepare a founder-approved Meta learning experiment'],
  ['weekly-review','Run a weekly money and learning review']
];
const taskTitles = [
  'Collect ISBN, format, page count and publication metadata for both books',
  'Prepare retailer-ready descriptions and category/keyword recommendations',
  'Audit current website, trust elements, mobile layout and checkout explanation',
  'Define email consent, lead magnets and three-email welcome sequences',
  'Define funnel events and revenue attribution without exposing payment data',
  'Prepare two Swedish Meta variants per book with kill and scale criteria',
  'Create the weekly review input and Reviewer Agent output contract'
];
(async()=>{
  await p.boostaWorkspace.upsert({where:{id:workspaceId},update:{name:'Boosta Förlag Workspace',brainSummary:'Direct, warm and practical Swedish publisher workspace. Priority: sell existing books through better distribution, trust, owned audience and measurable offers.',updatedAt:new Date()},create:{id:workspaceId,companyId,name:'Boosta Förlag Workspace',slug:'boosta-forlag',brainSummary:'Direct, warm and practical Swedish publisher workspace. Priority: sell existing books through better distribution, trust, owned audience and measurable offers.',createdBy:owner}});
  await p.boostaBrainVersion.upsert({where:{workspaceId_version:{workspaceId,version:1}},update:{status:'ACTIVE'},create:{workspaceId,version:1,status:'ACTIVE',source:'founder-brief',createdBy:owner,content:{company:'Boosta Förlag',website:'boostaforlag.se',business:'Swedish publisher',voice:'Direct, warm, practical, experienced; rak och ganska sträng, men med stor kärlek.',objective:'Improve discoverability, trust, and sales of the two existing Boosta Förlag books.',safety:['Never invent testimonials, media coverage, claims, sales or revenue.','Founder approval required for publishing, spending, outreach, discounts and external sends.']}}});
  const author = await p.boostaAuthor.upsert({where:{id:'BSTA-AUTHOR-MALLA'},update:{biography:'Former Stockholm primary-school principal with approximately 20 years of experience. Known for turning around difficult schools; coach and lecturer for school leaders.',verificationStatus:'NEEDS_VERIFICATION'},create:{id:'BSTA-AUTHOR-MALLA',workspaceId,name:'Malla Taipale',biography:'Former Stockholm primary-school principal with approximately 20 years of experience. Known for turning around difficult schools; coach and lecturer for school leaders.',verificationStatus:'NEEDS_VERIFICATION'}});
  const bookData = [
    {id:'BSTA-BOOK-REKTOR',title:'Rektor, Sveriges viktigaste chef',priceMinor:13400,description:'Book product record. Metadata and retailer information require verification.'},
    {id:'BSTA-BOOK-SKOLVALET',title:'Skolvalet, råd till föräldrar',priceMinor:14600,description:'Book product record. Metadata and retailer information require verification.'}
  ];
  const books=[];
  for(const b of bookData){
    await p.product.upsert({where:{id:b.id},update:{name:b.title,description:b.description,priceMinor:BigInt(b.priceMinor)},create:{id:b.id,companyId, name:b.title,productType:'BOOK',lifecycleStage:'ACTIVE',description:b.description,owner,priceMinor:BigInt(b.priceMinor),currency:'SEK',createdBy:owner}});
    books.push(await p.boostaBook.upsert({where:{id:b.id},update:{productId:b.id,authorId:author.id,priceMinor:BigInt(b.priceMinor)},create:{id:b.id,workspaceId,productId:b.id,authorId:author.id,title:b.title,priceMinor:BigInt(b.priceMinor),currency:'SEK',categories:['needs verification'],keywords:['needs verification'],metadataStatus:'NEEDS_VERIFICATION'}}));
  }
  for(const [key,name,role] of roles) await p.boostaAgentRole.upsert({where:{workspaceId_key:{workspaceId,key}},update:{name,role},create:{workspaceId,key,name,role,allowedTools:['research','draft','analyze','prepare'],expectedInputs:['current Company Brain','relevant mission/project/task context'],expectedOutputs:['traceable draft or analysis','source/evidence references','uncertainties and approval needs'],qualityStandards:['evidence-backed','no invented claims','Swedish brand voice','complete execution log'],humanApprovalRequired:true}});
  for(let i=0;i<taskSets.length;i++){
    const [key,name] = taskSets[i];
    const projectId='BSTA-PROJECT-'+key.toUpperCase().replace(/[^A-Z0-9]+/g,'-');
    const missionId='BSTA-MISSION-'+key.toUpperCase().replace(/[^A-Z0-9]+/g,'-');
    await p.project.upsert({where:{id:projectId},update:{name:'Boosta '+name,companyId},create:{id:projectId,companyId,name:'Boosta '+name,githubOwner:'cjram71',githubRepo:'agent-foundry',projectType:'boosta_'+key,authorisedStatus:false,governanceStatus:'LEGACY_APPROVED',spendingLimit:0}});
    const mission=await p.mission.upsert({where:{id:missionId},update:{goal:name+' for the two existing books.',projectId,companyId},create:{id:missionId,companyId,projectId,goal:name+' for the two existing books.',contextSummary:'Boosta Förlag revenue workflow; all external actions require founder approval.',constraints:['No invented claims or testimonials','No spending, publishing, sending or deployment without founder approval'],deliverables:[name,'Traceable artifacts and evidence'],definitionOfDone:['Draft output linked to task and agent run','Human approval state recorded'],failureConditions:['Missing evidence','Unapproved external action'],riskLevel:'medium',budgetUsd:0,tokenBudget:8000,maxParallelTasks:2,allowedToolClasses:['research','analysis','drafting'],approvalRules:['founder approval for consequential external actions'],provenance:'founder-brief',createdBy:owner,status:'draft'}});
    const title=taskTitles[i] || name;
    const taskId='BSTA-TASK-'+String(i+1).padStart(2,'0');
    const task=await p.task.upsert({where:{id:taskId},update:{title,projectId},create:{id:taskId,projectId,title,completeInstruction:'Produce a traceable draft with sources, uncertainties, and approval requirements.',status:'draft',state:'DRAFT',riskLevel:'medium',assignedAgent:roles[i%roles.length][0],department:'boosta',requiredInputs:['Company Brain','project context'],dependencyTaskIds:[],validationCriteria:['No invented business facts','Artifact and review linkage'],approvalRequired:true}});
    await p.missionTask.upsert({where:{taskId},update:{missionId,sequence:i+1},create:{missionId,taskId,sequence:i+1}});
    await p.boostaWorkflowApproval.createMany({data:[{workspaceId,taskId,approvalType:'task-plan',decision:'PENDING',requestedBy:owner}],skipDuplicates:true}).catch(()=>{});
  }
  for(const book of books) for(const retailer of ['Bokus','Adlibris']) await p.boostaDistributionSubmission.upsert({where:{bookId_retailer:{bookId:book.id,retailer}},update:{},create:{workspaceId,bookId:book.id,retailer,checklist:{isbn:false,format:false,pageCount:false,publicationDate:false,language:false,categories:false,keywords:false,coverFile:false,authorBiography:false,publisherInformation:false,vat:false,shipping:false},status:'NOT_STARTED'}});
  const offers=[['BSTA-OFFER-BUNDLE','Two-book bundle','BUNDLE',28000],['BSTA-OFFER-SCHOOL','Professional school bundle','B2B_BUNDLE',0],['BSTA-OFFER-WEBINAR','Book plus author webinar','EXPERTISE_UPSELL',0]];
  for(const [id,name,offerType,priceMinor] of offers) await p.boostaOffer.upsert({where:{id},update:{name},create:{id,workspaceId,name,offerType,priceMinor:BigInt(priceMinor),status:'DRAFT',approvalRequired:true}});
  for(const book of books) await p.boostaMarketingExperiment.upsert({where:{id:'BSTA-EXP-'+book.id.slice(-7)},update:{},create:{id:'BSTA-EXP-'+book.id.slice(-7),workspaceId,bookId:book.id,name:'Meta learning test: '+book.title,channel:'Meta',audience:'Swedish current and aspiring school leaders / parents of school-age children',variants:[{name:'problem-led',status:'DRAFT'},{name:'credibility-led',status:'DRAFT'}],dailyBudgetMinor:0,totalBudgetMinor:0,durationDays:7,killCriteria:['No valid tracking','Spend without approved consent/trust flow','Cost per result exceeds founder threshold'],scaleCriteria:['Measured purchase signal','Founder approval','Evidence of sustainable cost per result'],status:'DRAFT'}});
  const week=new Date(); week.setUTCHours(0,0,0,0); week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7));
  await p.boostaWeeklyReview.upsert({where:{workspaceId_weekStart:{workspaceId,weekStart:week}},update:{},create:{workspaceId,weekStart:week,createdBy:owner,status:'DRAFT',reviewerOutput:{questions:['What generated revenue?','Which channel produced best customers?','What is the simplest path to next 10,000 SEK?']}}});
  console.log(JSON.stringify({workspace:workspaceId,books:books.length,roles:roles.length,projects:taskSets.length,tasks:taskTitles.length,retailerSubmissions:4,offers:offers.length}));
})().catch(e=>{console.error('SEED_FAILED:'+e.message);process.exitCode=1}).finally(()=>p.$disconnect());