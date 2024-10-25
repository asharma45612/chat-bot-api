const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const postToOpenAI = require('../utils/ai-utils')

const fieldsToPluckForMatching = ["Name", "Designation", "Company", "Experience"];
const fieldsToPluckForFeedback = ["Category", "Question", "Response", "Rating", "Batch"]
const limit = 150;

var router = express.Router();

const datasetForMatch = [];
const datasetForFeedback = {}
const completeDataSet = [];

fs.createReadStream("./data/alumni_response.csv")
  .pipe(csv())
  .on("data", (row) => {
    if (completeDataSet.length < limit) {
      completeDataSet.push(row);

      const pluckFields = (fields, row) => fields.reduce((acc, field) => {
        acc[field] = row[field];
        return acc;
      }, {});

      const pluckedRowForFeedback = pluckFields(fieldsToPluckForFeedback, row);
      datasetForFeedback[pluckedRowForFeedback.Category] = datasetForFeedback[pluckedRowForFeedback.Category] || [];
      datasetForFeedback[pluckedRowForFeedback.Category].push(pluckedRowForFeedback);

      const isAlreadyPresent = datasetForMatch.find(({ Name }) => Name === row.Name);
      if (!isAlreadyPresent) {
        const pluckedRow = pluckFields(fieldsToPluckForMatching, row);
        datasetForMatch.push(pluckedRow);
      }
    }
  })
  .on("end", () => {
    console.log("file processed successfully");
  });


// chat bot end point
router.get("/match", async function (req, res, next) {
  const { designation, company, no_of_results, experience } = req.query;

  res.header("Access-Control-Allow-Origin", "*");
  
  const prompt = `
      I have a dataset of users:
      ${JSON.stringify(datasetForMatch)}

      Return the data 
      in array format 
      with name and match percentage as MatchPercentage (rounded to nearest integer and send in string with %) only of top ${no_of_results} unique profiles based on user name
      matching to the user based on his company name ${company} , designation ${designation} and experience ${experience}
    `;

  console.log(
    prompt
  )

  const response = await postToOpenAI(prompt, stream=false);

  if (response) { 
    console.log(response.data)
    const matchResponse = JSON.parse(response.data.choices[0].text);

    const botResponse = matchResponse.map(({MatchPercentage, Name: MatchedName}) => {
      const matchedProfile = completeDataSet.find(({ Name }) => Name === MatchedName);
      console.log(matchedProfile)
      const { Name, Designation, Company, Experience, Rating, Batch } = matchedProfile;

      const groupedFeedbacks = completeDataSet.filter(({ Name }) => Name === MatchedName).reduce((acc, {
        Category,
        Question,
        Response
      }) => {
        acc[Category] = acc[Category] || [];
        acc[Category].push({ Question, Response });
        return acc;
      }, {});

      return { Name, Designation, Company, Experience, MatchPercentage, Rating, groupedFeedbacks, Batch };
    })
    res.json(botResponse);
  } else {
    res.json([]);
  }
});

router.get("/user/feedbacks", async function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  const { name } = req.query;
  const groupedFeedbacks = completeDataSet.filter(({ Name }) => Name === name).reduce((acc, {
    Category,
    Question,
    Response
  }) => {
    if (!acc[Category]) {
      acc[Category] = [];
    }
    acc[Category].push({
      Question,
      Response
    });
    return acc;
  }, {});

  res.json(groupedFeedbacks);
});

router.get('/aggregate_feedback', async function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  const { category, designation, company, experience } = req.query;
  
  const categoryMap = {
    'Instructor Quality': 'Instructor Quality',
    'Time Commitment and Difficulty Level': 'Time Commitment and Difficulty Level',
    'Career growth': 'Career Impact and Value',
    'Value for money': 'Return on Investment (ROI)',
    'Networking & Community': 'Alumni Network and Community'
  }

  const csvCategory = categoryMap[category.trim()]

  console.log(csvCategory)

  const prompt = `
    Using the feedback dataset for category ${csvCategory}:
    ${JSON.stringify(datasetForFeedback[csvCategory])}

    Please provide the aggregated data from above dataset for category ${csvCategory} that corresponds to the designation ${designation}, company ${company}, and experience ${experience} in the following format:
     
    return average rating and aggregate feedback(in third person 5 list items) in json format
  `;


  const response = await postToOpenAI(prompt);
  const jsonResponse = JSON.parse(response.data.choices[0].text)

  const markdown = `
Average Rating: **${jsonResponse['Average Rating']}**

Feedback:
${jsonResponse['Aggregate Feedback'].map((feedback, index) => `- ${feedback}`).join('\n')}
  `

  console.log(markdown)
  
  
  if (response) {
    res.send(markdown);
  } else {
    res.send('')
  }
  
});

router.get('/past_learners_profile_percentage', async function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");

  

  const designationCounts = datasetForMatch.reduce((acc, profile) => {
    if (!acc[profile.Designation]) {
      acc[profile.Designation] = 0;
    }
    acc[profile.Designation]++;
    return acc;
  }, {});

  const totalProfiles = datasetForMatch.length;
  const profilePercentage = Object.keys(designationCounts).map(Designation => ({
    name: Designation,
    value: Math.round((designationCounts[Designation] / totalProfiles) * 100)
  }));
  
  res.json(profilePercentage);
});



// router.get("/", async function (req, res, next) {
//   const { text } = req.query;
//   const prompt = `
//       I have a CSV dataset of user profiles. Each profile includes the following fields: YourName, CompanyName, JobTitle. Below is the dataset:
//       ${JSON.stringify(datasetForAI)}

//       answer the following query '${text}' and based on dataset return the feedback
//     `;

//   const response = await postToOpenAI(prompt);

//   if (response) {
//     res.send(response.data.choices[0].text);
//   } else {
//     res.send("");
//   }
// });

// router.get('/', async function (req, res, next) {
//   const { text } = req.query;
//   const intentPrompt = `
//       query: ${text}
//       is the query about past feedback ?
//       if yes then return { isFeedbackQuery: true } else {isFeedbackQuery: false} in json format
//     `;

//   const intentResponse = await postToOpenAI(intentPrompt);
//   const parsedIntentResponse = JSON.parse(intentResponse.data.choices[0].text)

//   if (parsedIntentResponse.isFeedbackQuery) {
//     res.send(`
//       Sure I can help with you that. Please help with these questions to match you will some past learners. [Feedback](#feedback-form)
//       `)
//   } else {
//     const queryPrompt = `
//       I have a dataset of user profiles. Each profile includes the following fields: YourName, CompanyName, JobTitle, PositveFeedback. Below is the dataset:
//       ${JSON.stringify(datasetForAI)}

//       answer the following query '${text}'
//     `;

//     const queryResponse = await postToOpenAI(queryPrompt);

//     if (queryResponse) {
//       res.send(queryResponse.data.choices[0].text);
//     } else {
//       res.send("");
//     }
//   }
// })

module.exports = router;
