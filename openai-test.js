

require('dotenv').config();

// Assuming the OpenAI SDK supports CommonJS-style imports like this.
const OpenAI = require('openai');

const openai = new OpenAI({
  organization: process.env.ORGANIZATION_ID,
  apiKey: process.env.OPENAI_API_KEY, // Make sure to include your API key in the initialization
});

async function main() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: "You are a helpful assistant." }],
    });

    console.log(completion.choices[0]);
  } catch (error) {
    console.error(error);
  }
}

main();
