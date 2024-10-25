const axios = require("axios");

const postToOpenAI = async (prompt, stream = false) => {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/completions",
      {
        model: "gpt-3.5-turbo-instruct", // Ensure the model is available for your account
        prompt, // Use 'prompt' for completion models
        temperature: 0.1, // Adjust this for more randomness if needed
        max_tokens: 1500, // Limit the response to 150 tokens
        top_p: 0.1, // Full probability sampling
        frequency_penalty: 0.0, // No penalty for repetition
        presence_penalty: 0.0, // No penalty for introducing new topics,
        stream
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAT_API_TOKEN}`, // Pass the API key in the header
          "Content-Type": "application/json",
        },
        responseType: stream ? 'stream' : ''
      }
    );
    return response;
  } catch (error) {
    console.log(error.message);
  }
};

module.exports = postToOpenAI;
