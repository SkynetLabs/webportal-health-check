import { jest } from "@jest/globals";
import * as utils from "./utils";

describe("ipRegex", () => {
  const { ipRegex } = utils;

  test("should test true for valid ip", () => {
    expect(ipRegex.test("8.8.8.8")).toEqual(true);
    expect(ipRegex.test("127.0.0.1")).toEqual(true);
    expect(ipRegex.test("192.168.0.1")).toEqual(true);
    expect(ipRegex.test("10.10.10.10")).toEqual(true);
    expect(ipRegex.test("135.124.12.47")).toEqual(true);
  });

  test("should test false for invalid ip", () => {
    expect(ipRegex.test("888.8.8.8")).toEqual(false);
    expect(ipRegex.test("....")).toEqual(false);
    expect(ipRegex.test(null)).toEqual(false);
    expect(ipRegex.test("foo")).toEqual(false);
    expect(ipRegex.test("")).toEqual(false);
  });
});

describe("calculateElapsedTime", () => {
  const { calculateElapsedTime } = utils;

  test("should calculate elapsed time", () => {
    jest.useFakeTimers();

    const time = process.hrtime();

    jest.advanceTimersByTime(1234);

    expect(calculateElapsedTime(time)).toEqual(1234);
  });
});

describe("getYesterdayISOString", () => {
  const { getYesterdayISOString } = utils;

  test.each([
    ["2020-04-10T13:37:00.000Z", "2020-04-09T13:37:00.000Z"],
    ["2020-04-01T13:37:00.000Z", "2020-03-31T13:37:00.000Z"],
    ["2020-01-01T13:37:00.000Z", "2019-12-31T13:37:00.000Z"],
  ])("should get yesterday date as iso string for %s", (date, yesterday) => {
    jest.useFakeTimers().setSystemTime(new Date(date));

    expect(getYesterdayISOString()).toEqual(yesterday);
  });
});

describe("getResponseContent", () => {
  const { getResponseContent } = utils;

  describe("when body property is present", () => {
    test("should try to parse as json", () => {
      const response = { body: '{"foo":"bar"}' };

      expect(getResponseContent(response)).toEqual({ foo: "bar" });
    });

    test("should return raw if parsing as json failed", () => {
      const response = { body: "foo bar" };

      expect(getResponseContent(response)).toEqual("foo bar");
    });
  });

  describe("when text property is present and body property is not", () => {
    test("should try to parse as json", () => {
      const response = { text: '{"foo":"bar"}' };

      expect(getResponseContent(response)).toEqual({ foo: "bar" });
    });

    test("should return raw if parsing as json failed", () => {
      const response = { text: "foo bar" };

      expect(getResponseContent(response)).toEqual("foo bar");
    });
  });

  describe("when both body and text properties are present", () => {
    test("should favour body property", () => {
      const response = { body: "foo", text: "bar" };

      expect(getResponseContent(response)).toEqual("foo");
    });
  });
});

describe("ensureValidJSON", () => {
  const { ensureValidJSON } = utils;

  test("should replace undefined values with a placeholder", () => {
    const object = { foo: "bar", bar: undefined, fizz: { buzz: [1, undefined, 2] } };

    expect(ensureValidJSON(object)).toEqual({
      foo: "bar",
      bar: "--undefined--",
      fizz: { buzz: [1, "--undefined--", 2] },
    });
  });
});

describe("isPortalModuleEnabled", () => {
  const { isPortalModuleEnabled } = utils;
  const PORTAL_MODULES = process.env.PORTAL_MODULES;

  beforeEach(() => {
    process.env.PORTAL_MODULES = PORTAL_MODULES;
  });

  afterAll(() => {
    process.env.PORTAL_MODULES = PORTAL_MODULES;
  });

  test("should return false when portal modules are not defined", () => {
    expect(isPortalModuleEnabled("a")).toEqual(false);
  });

  test("should return true when portal modules includes a module", () => {
    process.env.PORTAL_MODULES = "abc";

    expect(isPortalModuleEnabled("c")).toEqual(true);
  });

  test("should return false when portal modules does not include a module", () => {
    process.env.PORTAL_MODULES = "abc";

    expect(isPortalModuleEnabled("g")).toEqual(false);
  });
});

describe("getDisabledServerReason", () => {
  const { getDisabledServerReason } = utils;
  const DENY_PUBLIC_ACCESS = process.env.DENY_PUBLIC_ACCESS;

  beforeEach(() => {
    process.env.DENY_PUBLIC_ACCESS = DENY_PUBLIC_ACCESS;
  });

  afterAll(() => {
    process.env.DENY_PUBLIC_ACCESS = DENY_PUBLIC_ACCESS;
  });

  test("should return manual reason for disabled server", () => {
    process.env.DENY_PUBLIC_ACCESS = false;

    expect(getDisabledServerReason("foo bar baz ?!")).toEqual("foo bar baz ?!");
  });

  test("should return server access denied message when env variable is set", () => {
    process.env.DENY_PUBLIC_ACCESS = true;

    expect(getDisabledServerReason()).toEqual("Server public access denied");
  });

  test("should concatenate manual reason and server access denied message", () => {
    process.env.DENY_PUBLIC_ACCESS = true;

    expect(getDisabledServerReason("foo bar baz ?!")).toEqual("foo bar baz ?! & Server public access denied");
  });
});

describe("parseHeaderString", () => {
  const { parseHeaderString } = utils;

  test("should return an object if string was a stringified object", () => {
    expect(parseHeaderString('{"foo":"bar"}')).toEqual({ foo: "bar" });
  });

  test("should return a string if the value is not an object", () => {
    expect(parseHeaderString("123foo")).toEqual("123foo");
  });
});

describe("getResponseErrorData", () => {
  const { getResponseErrorData } = utils;

  test("should return an object with certain properties", () => {
    const data = getResponseErrorData(new Error());

    expect(data).toHaveProperty("statusCode");
    expect(data).toHaveProperty("errorMessage");
    expect(data).toHaveProperty("errorResponseContent");
    expect(data).toHaveProperty("ip");
  });

  test("should find status code in response", () => {
    const data = getResponseErrorData({ response: { statusCode: 201 } });

    expect(data).toHaveProperty("statusCode", 201);
  });

  test("should find status code in error statusCode property", () => {
    const data = getResponseErrorData({ statusCode: 202 });

    expect(data).toHaveProperty("statusCode", 202);
  });

  test("should find status code in error status property", () => {
    const data = getResponseErrorData({ status: 203 });

    expect(data).toHaveProperty("statusCode", 203);
  });

  test("should assign error message", () => {
    const data = getResponseErrorData({ message: "foo bar :(" });

    expect(data).toHaveProperty("errorMessage", "foo bar :(");
  });

  test("should assign error response content if available", () => {
    const data = getResponseErrorData({ response: { body: "oooooof" } });

    expect(data).toHaveProperty("errorResponseContent", "oooooof");
  });

  test("should assign error response ip if available", () => {
    const data = getResponseErrorData({ response: { ip: "201.202.203.204" } });

    expect(data).toHaveProperty("ip", "201.202.203.204");
  });
});
