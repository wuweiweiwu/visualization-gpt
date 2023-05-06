// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

type Data = {
  query: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const messages = [];

  const numMessages = Object.keys(req.query).length / 2;
  for (let i = 0; i < numMessages; i++) {
    messages.push({
      role: req.query[`transcript[${i}][role]`],
      content: req.query[`transcript[${i}][content]`],
    });
  }

  const completion = await openai.createChatCompletion(
    {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a data visualization expert tasked with generating syntactically correct Vega-Lite specs that are best for visualizing the given data. Make sure that ALL axis titles are human-readable and not snake_case or camelCase. Write responses in markdown format. In the markdown code block do not specify the language of the code block.`,
        },
        ...messages,
      ],
      stream: true,
    },
    { responseType: "stream" }
  );

  completion.data.pipe(res);
}
