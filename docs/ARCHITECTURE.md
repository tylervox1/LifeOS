# V2.5 action architecture

User -> Assistant
          |
          v
     OpenAI Responses API
          |
          v
   Function/tool proposal
          |
          v
      approvals table
      status=pending
          |
     user approval
          |
          v
       jobs table
          |
          v
     worker process
       /        \
   Gmail      Calendar
       \        /
          v
   execution_result
          |
          v
      audit_log

No direct model-to-side-effect path exists.
