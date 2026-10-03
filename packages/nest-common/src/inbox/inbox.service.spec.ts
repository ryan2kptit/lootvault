import { Test } from "@nestjs/testing";
import { getModelToken, MongooseModule, Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { Model } from "mongoose";

import { startMongo } from "../testing";
import { InboxModule } from "./inbox.module";
import { InboxService } from "./inbox.service";
import { ProcessedEvent } from "./processed-event.schema";

@Schema({ collection: "counters" })
class Counter {
  @Prop({ type: String })
  _id: string;

  @Prop({ default: 0 })
  value: number;
}
const CounterSchema = SchemaFactory.createForClass(Counter);

describe("InboxService", () => {
  let mongo: Awaited<ReturnType<typeof startMongo>>;
  let inbox: InboxService;
  let counters: Model<Counter>;
  let processed: Model<ProcessedEvent>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    mongo = await startMongo();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.uri, { dbName: "inbox_test" }),
        MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }]),
        InboxModule,
      ],
    }).compile();
    inbox = moduleRef.get(InboxService);
    counters = moduleRef.get(getModelToken(Counter.name));
    processed = moduleRef.get(getModelToken(ProcessedEvent.name));
    await counters.create({ _id: "sold", value: 0 });
    await processed.init(); // build the _id index before concurrent inserts
    close = () => moduleRef.close();
  });

  afterAll(async () => {
    await close();
    await mongo.stop();
  });

  const increment = (session: Parameters<Parameters<InboxService["runOnce"]>[1]>[0]) =>
    counters.updateOne({ _id: "sold" }, { $inc: { value: 1 } }, { session }).then(() => undefined);

  it("applies an event once even when it is delivered twice", async () => {
    const event = { id: "31337:0xabc:1", type: "chain.TransferSingle" };
    expect(await inbox.runOnce(event, increment)).toBe("processed");
    expect(await inbox.runOnce(event, increment)).toBe("duplicate");
    expect((await counters.findById("sold"))?.value).toBe(1);
  });

  it("applies concurrent duplicates exactly once", async () => {
    const event = { id: "31337:0xabc:2", type: "chain.TransferSingle" };
    const results = await Promise.all(Array.from({ length: 5 }, () => inbox.runOnce(event, increment)));
    expect(results.filter((r) => r === "processed")).toHaveLength(1);
    expect((await counters.findById("sold"))?.value).toBe(2);
  });

  it("rolls back the inbox row when the handler fails, so a retry can succeed", async () => {
    const event = { id: "31337:0xabc:3", type: "chain.TransferSingle" };
    await expect(
      inbox.runOnce(event, async (session) => {
        await increment(session);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await processed.exists({ _id: event.id })).toBeNull();
    expect((await counters.findById("sold"))?.value).toBe(2);

    expect(await inbox.runOnce(event, increment)).toBe("processed");
    expect((await counters.findById("sold"))?.value).toBe(3);
  });
});
