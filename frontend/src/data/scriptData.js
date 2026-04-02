/**
 * Field types: text, textarea, select, checkbox, checkboxGroup, radio, grid
 * Colors: green, orange, red, dark
 * Icons reference Lucide icon names (mapped in the component)
 */

const finalExpenseEn = {
  id: 'final-expense-en',
  title: 'Final Expense (English)',
  subtitle: 'Final Expense (English) Sales Script',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      icon: 'phone',
      color: 'green',
      prompts: [
        { text: '"Hi, this is', field: 'agentName', after: 'I am the Licensed Insurance Agent who will be working with you. Who do I have the pleasure of speaking with?"' },
        { label: 'Client Name', field: 'clientName', placeholder: "Client's name" },
        { text: '"I see here you are calling in to compare options for final expense coverage today?"', badge: 'If yes, continue' },
        { text: '"Perfect, and you are between the ages of 50 and 80 years old, is that correct?"', badge: 'If yes, continue' },
        { text: '"Awesome, now just so you are aware, these programs aren\'t free but we do have multiple discount options to provide you the most coverage possible at the cheapest rate. Does that sound good?"' },
        { text: '"And for discount purposes, you do have an active checking or savings account, right?"', badge: 'If no — ask if they have a direct express card', badgeColor: 'orange' },
        { text: '"Great, and I see you\'re calling in from', field: 'clientState', placeholder: 'State', after: 'or you live in which state?"' },
      ],
    },
    {
      id: 'contact-info',
      title: 'Give Them Your Contact Info',
      icon: 'user',
      color: 'green',
      prompts: [
        { text: '"Perfect, and then do you happen to have a pen and paper handy? I\'m just going to have you write down a little bit of my information?"' },
        { text: '(Proceed to give your Full Name and Contact Info to them & NPN Number) *If Mobile Number, you can text it to them.', italic: true },
      ],
      fields: [
        { id: 'yourName', label: 'Your Name', type: 'text', placeholder: 'Your Name' },
        { id: 'yourPhone', label: 'Phone Number', type: 'text', placeholder: 'Your Phone' },
        { id: 'npnNumber', label: 'NPN Number', type: 'text', placeholder: 'NPN' },
      ],
      fieldLayout: 'grid-3',
    },
    {
      id: 'pain-point',
      title: 'Find Pain Point / Why',
      icon: 'heart',
      color: 'orange',
      prompts: [
        { text: '"Now, were you looking to just take care of the funeral and final expenses, or were you looking to leave some I Love You Money behind?"' },
        { text: '"And did you know if you wanted to be buried or cremated?"' },
      ],
      fields: [
        { id: 'burialOrCremation', label: 'Burial or Cremation', type: 'text', placeholder: 'Burial / Cremation' },
      ],
    },
    {
      id: 'beneficiary',
      title: 'Beneficiary Information',
      icon: 'user',
      color: 'orange',
      prompts: [
        { text: '"Now [Customer Name], is there someone you had in mind as the beneficiary, or is there someone who would be responsible for everything after your passing?"' },
      ],
      fields: [
        { id: 'beneficiaryName', label: 'Beneficiary Name', type: 'text', placeholder: 'First Name' },
        { id: 'beneficiaryRelationship', label: 'Relationship', type: 'text', placeholder: 'Spouse, Sibling, Child, etc' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'explain-process',
      title: 'Explain Process & Remove Objections',
      icon: 'file',
      color: 'dark',
      prompts: [
        { text: '"Just so you know, our process is pretty simple... I\'m a broker so I work with over 50 different insurance companies to make sure you get the cheapest rate and max benefit possible. Does that make sense, First Name?"' },
        { text: '"All of our Insurance Carriers are A-rated like **Mutual of Omaha, Americo, Aetna, and Royal Neighbors**. You\'ve probably heard of a couple of those, right?"' },
        { text: '"We make sure you don\'t get penalized for any pre-existing conditions so I can make sure we get you the best options. I\'m just going to ask a few health questions to see which company might be able to approve you for coverage, okay?"' },
      ],
    },
    {
      id: 'health-lifestyle',
      title: 'Health & Lifestyle Information',
      icon: 'heart',
      color: 'red',
      prompts: [
        { text: '"So first things first, are you a smoker or a non-smoker...?"' },
      ],
      fields: [
        { id: 'smoker', label: 'Smoker', type: 'checkbox' },
        { id: 'dob', label: 'DOB', type: 'text', placeholder: 'MM/DD/YYYY' },
        { id: 'currentAge', label: 'Current Age', type: 'text', placeholder: 'Age' },
      ],
      fieldLayout: 'inline-3',
      additionalPrompts: [
        { text: '"Are you taking any medications for anything right now?"' },
      ],
      additionalFields: [
        { id: 'medicationNames', label: 'Medication Names', type: 'text', placeholder: 'Medications' },
        { id: 'medicationsFor', label: 'What they\'re for', type: 'text', placeholder: 'Diabetes, Blood Pressure, etc' },
      ],
      additionalFieldLayout: 'grid-2',
      tip: 'Tip: If they say diabetes, ask "Do you take metformin or insulin?" — makes you sound more educated',
      conditionGroup: {
        label: 'Any Major Medicals in the last 4 years? (Circle all that apply)',
        options: ['Cancer', 'Heart Attack', 'Stroke', 'COPD', 'Blood Clots', 'Organ/Renal Failure', 'Kidney Dialysis'],
        id: 'majorMedicals',
      },
      trailingFields: [
        { id: 'otherConditions', label: 'Other Conditions', type: 'text', placeholder: 'Other conditions...' },
        { id: 'diagnosisDate', label: 'Year/Month of Diagnosis', type: 'text', placeholder: 'MM/YYYY' },
      ],
      trailingFieldLayout: 'grid-2',
    },
    {
      id: 'income',
      title: 'Income Questions',
      icon: 'dollar',
      color: 'green',
      prompts: [
        { text: '"Now First Name, what I do is I quote within the 4–5% range of monthly income so no food is being taken off the table and I make sure this fits comfortably..."' },
        { text: '"Remind me, are you currently working, retired, or disabled?"' },
        { text: '"Gotcha... and then on a monthly basis, about how much does that bring you in each month?"' },
      ],
      fields: [
        { id: 'employmentStatus', label: 'Employment Status', type: 'text', placeholder: 'Working / Retired / Disabled' },
        { id: 'monthlyIncome', label: 'Monthly Income', type: 'text', placeholder: '$' },
      ],
      fieldLayout: 'grid-2',
      tip: 'Tip: Multiply their monthly income by 7% to get the price range to quote.',
    },
    {
      id: 'quote-options',
      title: 'Quote Options',
      icon: 'circle',
      color: 'orange',
      prompts: [
        { text: '"Do you still have your piece of paper with you? I\'m going to show you a few options... Write down Gold, Silver, Bronze on your paper and space it out a bit. Like the medals..."' },
        { text: '*When list prices make sure that you always say "Bucks" and not dollars', italic: true },
      ],
      quoteTiers: [
        { label: 'GOLD', id: 'goldPrice', placeholder: '$XX/mo', emoji: '🥇' },
        { label: 'SILVER', id: 'silverPrice', placeholder: '$XX/mo', emoji: '🥈' },
        { label: 'BRONZE', id: 'bronzePrice', placeholder: '$XX/mo', emoji: '🥉' },
      ],
      trailingPrompts: [
        { text: '"Out of these 3 options, which one looks the best and is the most comfortable to see if you can get approved for this?"' },
      ],
      trailingFields: [
        { id: 'selectedOption', label: 'Selected Option', type: 'text', placeholder: 'Gold / Silver / Bronze' },
      ],
    },
    {
      id: 'before-application',
      title: 'Before Application',
      icon: 'phone',
      color: 'dark',
      prompts: [
        { text: '"Okay, now what I\'m going to do is pull up this 3 minute application..."' },
        { text: '"Does your phone receive text messages, correct?"' },
        { text: '"Awesome, I\'m sending you over a copy of my Driver\'s License, attached to it will have my Department of Insurance license and also a copy of my business card. Since I\'ll be your insurance agent moving forward I need you to print this out and place it on your refrigerator okay?"' },
      ],
      warning: 'DO NOT PROCEED UNTIL THEY LOOK AT IT.',
    },
    {
      id: 'policy-benefits',
      title: 'Explain Policy Benefits',
      icon: 'circle',
      color: 'green',
      prompts: [
        { text: '"The program we are looking at today is a Whole Life Policy, which means you have…"' },
      ],
      checklist: [
        'Fixed Rates for Life',
        'Fixed Coverage for Life',
        'Cash Value Accumulation included',
      ],
      trailingPrompts: [
        { text: '"So this means You Do Not Have To Worry About Your Policy or Prices Changing Later, does that make sense?"' },
      ],
      trailingChecklist: [
        'Death Benefit is 100% Tax Free',
        'Not accessible to creditors or debtors',
        'Day 1 Coverage, no waiting period',
      ],
    },
    {
      id: 'begin-application',
      title: 'Begin Application',
      icon: 'file',
      color: 'dark',
      prompts: [
        { text: '"When we get the approval started, the carrier will first ask us to confirm some basic information. Please spell your name for me when you\'re ready."' },
      ],
      fields: [
        { id: 'appFirstName', label: '1. First Name', type: 'text' },
        { id: 'appLastName', label: '2. Last Name', type: 'text' },
        { id: 'appPhone', label: '3. Phone Number', type: 'text', icon: 'phone' },
        { id: 'appEmail', label: '4. Email Address', type: 'text', icon: 'mail' },
        { id: 'appBirthState', label: '5. Birth State', type: 'text', icon: 'mapPin' },
        { id: 'appCurrentState', label: '6. Current State', type: 'text', icon: 'mapPin' },
        { id: 'appDriversLicense', label: "7. Driver's License Number", type: 'text', fullWidth: true },
      ],
      fieldLayout: 'grid-2',
      additionalPrompts: [
        { text: '"Now my mom would kill me for asking this, but what is a good height and weight for you?"' },
      ],
      additionalFields: [
        { id: 'appHeight', label: '10. Height', type: 'text', placeholder: '5\'10"' },
        { id: 'appWeight', label: '11. Weight', type: 'text', placeholder: 'lbs' },
      ],
      additionalFieldLayout: 'grid-2',
      morePrompts: [
        { text: '"You are a U.S. citizen, correct?"' },
        { text: '"When they do a quick medical background check, they\'ll have us verify your Social, go ahead with that whenever you\'re ready..."' },
      ],
      moreFields: [
        { id: 'appSSN', label: '12. Social Security Number', type: 'text', placeholder: 'XXX-XX-XXXX' },
      ],
      finalPrompts: [
        { text: '"When you get your benefits, do they normally come on the 1st, the 3rd, or on a Wednesday?"' },
      ],
      finalFields: [
        { id: 'appEffectiveDate', label: '13. Effective Date', type: 'text', placeholder: 'MM/DD/YYYY', icon: 'calendar' },
      ],
      bankPrompts: [
        { text: '"Remind me what was the name of your bank? And you did open that up in [state]?"' },
        { text: '"Let me see if [company] partners with them... Great they do! I have their routing number here on my end, can you put something in front of you to make sure I have the correct one?"' },
      ],
      bankFields: [
        { id: 'bankName', label: 'Bank Name', type: 'text' },
        { id: 'routingNumber', label: 'Routing Number', type: 'text' },
        { id: 'accountNumber', label: 'Account Number', type: 'text' },
      ],
      bankFieldLayout: 'grid-3',
    },
    {
      id: 'finalize',
      title: 'Finalize',
      icon: 'checkCircle',
      color: 'green',
      prompts: [
        { text: '"I\'m submitting this in now and to submit it, I\'m going to send you a quick confirmation code via text to see if we got this fully approved..."' },
        { text: '"We\'re just about finished. If you still have your pen and paper, please write down the following information:"' },
      ],
      fields: [
        { id: 'policyNumber', label: 'Policy Number', type: 'text' },
        { id: 'carrier', label: 'Carrier', type: 'text' },
        { id: 'benefitAmount', label: 'Benefit Amount', type: 'text', placeholder: '$' },
        { id: 'monthlyPremium', label: 'Monthly Premium', type: 'text', placeholder: '$' },
        { id: 'startDate', label: 'Start Date', type: 'text' },
      ],
      fieldLayout: 'grid-3-2',
      closingPrompts: [
        { text: '"You\'ll receive your policy packet in the mail within 7–10 business days."' },
        { text: '"Please keep one copy for yourself and one for your beneficiary."' },
        { text: '"If anything were to happen, your beneficiary would call the customer service number on the policy with a death certificate and receive the benefit within 24–48 hours."' },
        { text: '"If you have any questions at all, don\'t hesitate to reach out."' },
      ],
    },
  ],
};

const finalExpenseEs = {
  id: 'final-expense-es',
  title: 'Final Expense (Español)',
  subtitle: 'Guión de Ventas de Gastos Finales (Español)',
  sections: [
    {
      id: 'apertura',
      title: 'Apertura',
      icon: 'phone',
      color: 'green',
      prompts: [
        { text: '"Hola, le habla', field: 'agentName', after: 'soy el Agente de Seguros Licenciado que va a trabajar con usted. ¿Con quién tengo el placer de hablar?"' },
        { label: 'Nombre del Cliente', field: 'clientName', placeholder: 'Nombre del cliente' },
        { text: '"Veo que está llamando para comparar opciones de cobertura de gastos finales hoy, ¿correcto?"', badge: 'Si sí, continúe' },
        { text: '"Perfecto, y usted tiene entre 50 y 80 años, ¿correcto?"', badge: 'Si sí, continúe' },
        { text: '"Excelente, ahora solo para que sepa, estos programas no son gratuitos pero sí tenemos múltiples opciones de descuento para proporcionarle la mayor cobertura posible al precio más económico. ¿Le parece bien?"' },
        { text: '"Y para propósitos de descuento, ¿usted tiene una cuenta de cheques o ahorros activa?"' },
        { text: '"Genial, y veo que llama desde', field: 'clientState', placeholder: 'Estado', after: '¿o en qué estado vive?"' },
      ],
    },
    {
      id: 'info-contacto',
      title: 'Dar Su Información de Contacto',
      icon: 'user',
      color: 'green',
      prompts: [
        { text: '"Perfecto, ¿tiene a la mano un bolígrafo y papel? Le voy a dar un poco de mi información."' },
      ],
      fields: [
        { id: 'yourName', label: 'Su Nombre', type: 'text', placeholder: 'Su Nombre' },
        { id: 'yourPhone', label: 'Teléfono', type: 'text', placeholder: 'Su Teléfono' },
        { id: 'npnNumber', label: 'Número NPN', type: 'text', placeholder: 'NPN' },
      ],
      fieldLayout: 'grid-3',
    },
    {
      id: 'punto-dolor',
      title: 'Encontrar Punto de Dolor / Por Qué',
      icon: 'heart',
      color: 'orange',
      prompts: [
        { text: '"¿Usted estaba buscando cubrir solo los gastos funerarios y finales, o también quería dejar algo de dinero extra para sus seres queridos?"' },
        { text: '"¿Y ya sabe si prefiere ser enterrado o cremado?"' },
      ],
      fields: [
        { id: 'burialOrCremation', label: 'Entierro o Cremación', type: 'text', placeholder: 'Entierro / Cremación' },
      ],
    },
    {
      id: 'beneficiario',
      title: 'Información del Beneficiario',
      icon: 'user',
      color: 'orange',
      prompts: [
        { text: '"¿Tiene a alguien en mente como beneficiario, o hay alguien que sería responsable de todo después de su fallecimiento?"' },
      ],
      fields: [
        { id: 'beneficiaryName', label: 'Nombre del Beneficiario', type: 'text', placeholder: 'Nombre' },
        { id: 'beneficiaryRelationship', label: 'Parentesco', type: 'text', placeholder: 'Esposo/a, Hermano/a, Hijo/a, etc' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'explicar-proceso',
      title: 'Explicar Proceso y Remover Objeciones',
      icon: 'file',
      color: 'dark',
      prompts: [
        { text: '"Nuestro proceso es bastante simple... Soy un corredor, así que trabajo con más de 50 compañías de seguros diferentes para asegurar que usted obtenga la tarifa más económica y el máximo beneficio posible."' },
        { text: '"Todas nuestras aseguradoras son de categoría A, como **Mutual of Omaha, Americo, Aetna y Royal Neighbors**."' },
        { text: '"Nos aseguramos de que no sea penalizado por condiciones preexistentes. Voy a hacer unas preguntas de salud para ver qué compañía podría aprobarle, ¿está bien?"' },
      ],
    },
    {
      id: 'salud',
      title: 'Información de Salud y Estilo de Vida',
      icon: 'heart',
      color: 'red',
      prompts: [
        { text: '"Primero que nada, ¿usted fuma o no fuma?"' },
      ],
      fields: [
        { id: 'smoker', label: 'Fumador', type: 'checkbox' },
        { id: 'dob', label: 'Fecha de Nacimiento', type: 'text', placeholder: 'DD/MM/AAAA' },
        { id: 'currentAge', label: 'Edad Actual', type: 'text', placeholder: 'Edad' },
      ],
      fieldLayout: 'inline-3',
      additionalPrompts: [
        { text: '"¿Está tomando algún medicamento actualmente?"' },
      ],
      additionalFields: [
        { id: 'medicationNames', label: 'Medicamentos', type: 'text', placeholder: 'Medicamentos' },
        { id: 'medicationsFor', label: 'Para qué son', type: 'text', placeholder: 'Diabetes, Presión, etc' },
      ],
      additionalFieldLayout: 'grid-2',
      conditionGroup: {
        label: '¿Alguna condición médica grave en los últimos 4 años?',
        options: ['Cáncer', 'Infarto', 'Derrame', 'EPOC', 'Coágulos', 'Insuficiencia Renal', 'Diálisis'],
        id: 'majorMedicals',
      },
      trailingFields: [
        { id: 'otherConditions', label: 'Otras Condiciones', type: 'text', placeholder: 'Otras condiciones...' },
        { id: 'diagnosisDate', label: 'Fecha de Diagnóstico', type: 'text', placeholder: 'MM/AAAA' },
      ],
      trailingFieldLayout: 'grid-2',
    },
    {
      id: 'ingresos',
      title: 'Preguntas de Ingresos',
      icon: 'dollar',
      color: 'green',
      prompts: [
        { text: '"Lo que hago es cotizar dentro del 4–5% del ingreso mensual para asegurar que le quede cómodo..."' },
        { text: '"¿Actualmente está trabajando, jubilado/a o discapacitado/a?"' },
        { text: '"¿Y aproximadamente cuánto le llega al mes?"' },
      ],
      fields: [
        { id: 'employmentStatus', label: 'Estado Laboral', type: 'text', placeholder: 'Trabajando / Jubilado / Discapacitado' },
        { id: 'monthlyIncome', label: 'Ingreso Mensual', type: 'text', placeholder: '$' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'cotizacion',
      title: 'Opciones de Cotización',
      icon: 'circle',
      color: 'orange',
      quoteTiers: [
        { label: 'ORO', id: 'goldPrice', placeholder: '$XX/mes', emoji: '🥇' },
        { label: 'PLATA', id: 'silverPrice', placeholder: '$XX/mes', emoji: '🥈' },
        { label: 'BRONCE', id: 'bronzePrice', placeholder: '$XX/mes', emoji: '🥉' },
      ],
      trailingFields: [
        { id: 'selectedOption', label: 'Opción Seleccionada', type: 'text', placeholder: 'Oro / Plata / Bronce' },
      ],
    },
    {
      id: 'finalizar',
      title: 'Finalizar',
      icon: 'checkCircle',
      color: 'green',
      prompts: [
        { text: '"Estoy enviando esto ahora y para someterlo, le voy a enviar un código de confirmación por mensaje de texto..."' },
      ],
      fields: [
        { id: 'policyNumber', label: 'Número de Póliza', type: 'text' },
        { id: 'carrier', label: 'Aseguradora', type: 'text' },
        { id: 'benefitAmount', label: 'Monto del Beneficio', type: 'text', placeholder: '$' },
        { id: 'monthlyPremium', label: 'Prima Mensual', type: 'text', placeholder: '$' },
        { id: 'startDate', label: 'Fecha de Inicio', type: 'text' },
      ],
      fieldLayout: 'grid-3-2',
      closingPrompts: [
        { text: '"Recibirá su paquete de póliza por correo en 7–10 días hábiles."' },
        { text: '"Guarde una copia para usted y una para su beneficiario."' },
        { text: '"Si tiene alguna pregunta, no dude en comunicarse."' },
      ],
    },
  ],
};

const medicare = {
  id: 'medicare',
  title: 'Medicare',
  subtitle: 'Medicare Supplement & Advantage Sales Script',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      icon: 'phone',
      color: 'green',
      prompts: [
        { text: '"Hi, this is', field: 'agentName', after: 'I\'m a Licensed Insurance Agent. I\'m calling because you recently inquired about Medicare options. Is that correct?"' },
        { label: 'Client Name', field: 'clientName', placeholder: "Client's name" },
        { text: '"Great, and can I confirm — are you currently enrolled in Medicare Parts A and B?"', badge: 'If yes, continue' },
        { text: '"And what is your zip code so I can look up the plans available in your area?"' },
      ],
      fields: [
        { id: 'zipCode', label: 'Zip Code', type: 'text', placeholder: 'Zip Code' },
      ],
    },
    {
      id: 'verify-eligibility',
      title: 'Verify Eligibility',
      icon: 'checkCircle',
      color: 'green',
      prompts: [
        { text: '"Just to confirm a few things so I can find you the best plan..."' },
      ],
      fields: [
        { id: 'medicarePartA', label: 'Medicare Part A Effective Date', type: 'text', placeholder: 'MM/YYYY' },
        { id: 'medicarePartB', label: 'Medicare Part B Effective Date', type: 'text', placeholder: 'MM/YYYY' },
        { id: 'medicareBeneficiaryNumber', label: 'Medicare Beneficiary Number (MBI)', type: 'text', placeholder: 'MBI' },
        { id: 'dob', label: 'Date of Birth', type: 'text', placeholder: 'MM/DD/YYYY' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'current-coverage',
      title: 'Current Coverage Review',
      icon: 'file',
      color: 'dark',
      prompts: [
        { text: '"Do you currently have any Medicare Supplement or Medicare Advantage plan?"' },
        { text: '"Are you happy with it, or have you been experiencing any issues — like high out-of-pocket costs, doctor network limitations, or premium increases?"' },
      ],
      fields: [
        { id: 'currentPlan', label: 'Current Plan', type: 'text', placeholder: 'Plan name or None' },
        { id: 'currentPremium', label: 'Current Monthly Premium', type: 'text', placeholder: '$' },
        { id: 'mainConcern', label: 'Main Concern / Issue', type: 'text', placeholder: 'Cost, network, coverage gaps...' },
      ],
    },
    {
      id: 'plan-comparison',
      title: 'Plan Comparison & Recommendation',
      icon: 'circle',
      color: 'orange',
      prompts: [
        { text: '"Based on what you\'ve told me, let me pull up the plans available in your area..."' },
        { text: '"I\'m going to compare a few options for you — I want to make sure we find the best balance of coverage and cost."' },
      ],
      fields: [
        { id: 'recommendedPlan', label: 'Recommended Plan', type: 'text', placeholder: 'Plan name' },
        { id: 'recommendedPremium', label: 'Monthly Premium', type: 'text', placeholder: '$' },
        { id: 'planType', label: 'Plan Type', type: 'text', placeholder: 'Supplement / Advantage / PDP' },
        { id: 'carrier', label: 'Carrier', type: 'text' },
      ],
      fieldLayout: 'grid-2',
      tip: 'Tip: Always present at least 2 options so the client feels they have a choice.',
    },
    {
      id: 'enrollment',
      title: 'Enrollment',
      icon: 'file',
      color: 'green',
      prompts: [
        { text: '"Great, let\'s go ahead and get you enrolled. The carrier will need to verify some information..."' },
      ],
      fields: [
        { id: 'appFirstName', label: 'First Name', type: 'text' },
        { id: 'appLastName', label: 'Last Name', type: 'text' },
        { id: 'appDOB', label: 'Date of Birth', type: 'text', placeholder: 'MM/DD/YYYY' },
        { id: 'appPhone', label: 'Phone', type: 'text' },
        { id: 'appEmail', label: 'Email', type: 'text' },
        { id: 'appAddress', label: 'Mailing Address', type: 'text', fullWidth: true },
      ],
      fieldLayout: 'grid-2',
      additionalFields: [
        { id: 'primaryDoctor', label: 'Primary Care Doctor', type: 'text' },
        { id: 'pharmacy', label: 'Preferred Pharmacy', type: 'text' },
      ],
      additionalFieldLayout: 'grid-2',
    },
    {
      id: 'closing',
      title: 'Closing',
      icon: 'checkCircle',
      color: 'green',
      prompts: [
        { text: '"You\'re all set! Here\'s a summary of what we\'ve enrolled you in..."' },
      ],
      fields: [
        { id: 'enrolledPlan', label: 'Enrolled Plan', type: 'text' },
        { id: 'enrolledCarrier', label: 'Carrier', type: 'text' },
        { id: 'enrolledPremium', label: 'Monthly Premium', type: 'text', placeholder: '$' },
        { id: 'effectiveDate', label: 'Effective Date', type: 'text', placeholder: 'MM/DD/YYYY' },
      ],
      fieldLayout: 'grid-2',
      closingPrompts: [
        { text: '"You\'ll receive your new plan materials in the mail within 7–14 business days."' },
        { text: '"Your new plan becomes effective on the date we discussed. Until then, your current coverage remains active."' },
        { text: '"If you have any questions, don\'t hesitate to call me directly."' },
      ],
    },
  ],
};

const aca = {
  id: 'aca',
  title: 'ACA / Health Insurance',
  subtitle: 'Affordable Care Act / Health Insurance Marketplace Script',
  sections: [
    {
      id: 'opening',
      title: 'Opening',
      icon: 'phone',
      color: 'green',
      prompts: [
        { text: '"Hi, this is', field: 'agentName', after: 'I\'m a Licensed Insurance Agent helping people find affordable health coverage. I understand you\'re looking for health insurance options?"' },
        { label: 'Client Name', field: 'clientName', placeholder: "Client's name" },
        { text: '"Great — I\'m going to help you see if you qualify for any subsidies or tax credits that can lower your monthly premium, sometimes all the way to $0."' },
      ],
    },
    {
      id: 'household-info',
      title: 'Household Information',
      icon: 'user',
      color: 'green',
      prompts: [
        { text: '"Let me gather some quick information to see what you qualify for..."' },
      ],
      fields: [
        { id: 'householdSize', label: 'Household Size', type: 'text', placeholder: 'Number of people' },
        { id: 'applicantAge', label: 'Your Age', type: 'text', placeholder: 'Age' },
        { id: 'spouseAge', label: 'Spouse Age (if applicable)', type: 'text', placeholder: 'Age or N/A' },
        { id: 'dependents', label: 'Number of Dependents', type: 'text', placeholder: '0' },
        { id: 'zipCode', label: 'Zip Code', type: 'text', placeholder: 'Zip Code' },
        { id: 'county', label: 'County', type: 'text', placeholder: 'County' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'income-verification',
      title: 'Income Verification',
      icon: 'dollar',
      color: 'orange',
      prompts: [
        { text: '"Now I need to verify your household income — this is what determines your subsidy amount..."' },
        { text: '"Are you currently employed, self-employed, or receiving any other form of income?"' },
      ],
      fields: [
        { id: 'employmentType', label: 'Employment Type', type: 'text', placeholder: 'Employed / Self-employed / Unemployed' },
        { id: 'annualIncome', label: 'Estimated Annual Household Income', type: 'text', placeholder: '$' },
        { id: 'incomeSource', label: 'Income Source', type: 'text', placeholder: 'W2, 1099, Social Security, etc' },
      ],
      tip: 'Tip: Income must be between 100%–400% of Federal Poverty Level for subsidy eligibility. For a single person in 2026, that\'s roughly $15,060–$60,240/year.',
    },
    {
      id: 'plan-options',
      title: 'Plan Options',
      icon: 'circle',
      color: 'orange',
      prompts: [
        { text: '"Based on your information, here are the plan tiers available to you..."' },
        { text: '"Plans are categorized as Bronze, Silver, Gold, and Platinum — the main difference is how costs are shared between you and the insurance company."' },
      ],
      fields: [
        { id: 'selectedTier', label: 'Selected Tier', type: 'text', placeholder: 'Bronze / Silver / Gold / Platinum' },
        { id: 'selectedPlan', label: 'Plan Name', type: 'text', placeholder: 'Plan name' },
        { id: 'monthlyPremium', label: 'Monthly Premium (after subsidy)', type: 'text', placeholder: '$' },
        { id: 'deductible', label: 'Annual Deductible', type: 'text', placeholder: '$' },
        { id: 'maxOOP', label: 'Max Out-of-Pocket', type: 'text', placeholder: '$' },
        { id: 'subsidyAmount', label: 'Monthly Subsidy / Tax Credit', type: 'text', placeholder: '$' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'enrollment',
      title: 'Enrollment',
      icon: 'file',
      color: 'green',
      prompts: [
        { text: '"Let\'s get you enrolled. I\'ll need some personal information to complete the application on Healthcare.gov..."' },
      ],
      fields: [
        { id: 'appFirstName', label: 'First Name', type: 'text' },
        { id: 'appLastName', label: 'Last Name', type: 'text' },
        { id: 'appDOB', label: 'Date of Birth', type: 'text', placeholder: 'MM/DD/YYYY' },
        { id: 'appSSN', label: 'Social Security Number', type: 'text', placeholder: 'XXX-XX-XXXX' },
        { id: 'appPhone', label: 'Phone Number', type: 'text' },
        { id: 'appEmail', label: 'Email Address', type: 'text' },
        { id: 'appAddress', label: 'Street Address', type: 'text', fullWidth: true },
        { id: 'appCity', label: 'City', type: 'text' },
        { id: 'appState', label: 'State', type: 'text' },
        { id: 'appZip', label: 'Zip Code', type: 'text' },
      ],
      fieldLayout: 'grid-2',
    },
    {
      id: 'closing',
      title: 'Closing',
      icon: 'checkCircle',
      color: 'green',
      fields: [
        { id: 'confirmationNumber', label: 'Marketplace Confirmation Number', type: 'text' },
        { id: 'enrolledPlan', label: 'Enrolled Plan', type: 'text' },
        { id: 'enrolledPremium', label: 'Monthly Premium', type: 'text', placeholder: '$' },
        { id: 'effectiveDate', label: 'Coverage Effective Date', type: 'text', placeholder: 'MM/DD/YYYY' },
      ],
      fieldLayout: 'grid-2',
      closingPrompts: [
        { text: '"Congratulations! You\'re now enrolled in health coverage."' },
        { text: '"You\'ll receive a confirmation email and your insurance card in the mail within 2–3 weeks."' },
        { text: '"Remember — if your income or household size changes, let me know so we can update your application."' },
        { text: '"I\'m your agent, so feel free to reach out anytime you need help."' },
      ],
    },
  ],
};

export const SCRIPTS = {
  'final-expense-en': finalExpenseEn,
  'final-expense-es': finalExpenseEs,
  'medicare': medicare,
  'aca': aca,
};

export const SCRIPT_OPTIONS = [
  { value: 'final-expense-en', label: 'Final Expense (English)' },
  { value: 'final-expense-es', label: 'Final Expense (Español)' },
  { value: 'medicare', label: 'Medicare' },
  { value: 'aca', label: 'ACA / Health Insurance' },
];
