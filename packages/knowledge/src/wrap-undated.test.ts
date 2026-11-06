import { describe, expect, it } from "vitest";
import { undated } from "./wrap.ts";

describe("undated", () => {
  it("drops old deadlines from kit tasks", () => {
    expect(undated("Priya confirms the final headcount with the caterer by 11:59 AM today")).toBe("Priya confirms the final headcount with the caterer");
    expect(undated("Print the name badges by Friday")).toBe("Print the name badges");
    expect(undated("Book the projector before 20 November.")).toBe("Book the projector.");
    expect(undated("Print the name badges")).toBe("Print the name badges");
    expect(undated("Send the sponsor confirmation email")).toBe("Send the sponsor confirmation email");
  });
});
