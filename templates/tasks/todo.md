# Todo

## Current Session

_What are you working on right now? Update this at the start and end of every session._

---

## In Progress

<!-- Move items here when you start them. Mark done with [x] when complete. -->

---

## Up Next

<!-- Prioritized queue of things to pick up next session. -->

---

## Blocked

<!-- Items waiting on someone else or an external dependency. -->

---

## Recently Completed

<!-- Keep the last 5-10 completions for reference. -->

---

## Task Plan Format Reference

<!--
When /story or /run-tasks generates a task plan, it uses this XML format.
Delete this section once you have a real plan — it's just for reference.

```xml
<tasks story="12345">
  <task id="1" parallel_group="1" type="auto">
    <name>Add the FooService interface</name>
    <files>src/Services/IFooService.cs</files>
    <action>Create the interface with the required methods</action>
    <verify>dotnet build</verify>
    <done>IFooService.cs exists and builds clean</done>
  </task>
  <task id="2" parallel_group="1" type="auto">
    <name>Implement FooService</name>
    <files>src/Services/FooService.cs</files>
    <action>Implement the interface with business logic</action>
    <verify>dotnet build</verify>
    <done>FooService.cs implements IFooService and builds clean</done>
  </task>
  <task id="3" parallel_group="2" type="auto">
    <name>Register FooService in DI</name>
    <files>src/DependencyInjection.cs</files>
    <action>Add AddScoped&lt;IFooService, FooService&gt;()</action>
    <verify>dotnet build</verify>
    <done>DI registration present, builds clean</done>
  </task>
</tasks>
```

Key fields:
- parallel_group: tasks in the same group run concurrently; groups run in order
- type: "auto" (Claude executes), "manual" (human action needed), "test" (run tests)
- verify: command to confirm the task is done correctly
- DI tasks always go in a LATER parallel_group than the services they register
-->
