using Dongi.Api.Data;
using Dongi.Api.Services;
using Dongi.Api.Startup;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configuration placeholders. Secrets stay out of appsettings.json; supply them
// through user-secrets, environment variables, or a local (git-ignored) file.
builder.Services.Configure<MongoDbSettings>(
    builder.Configuration.GetSection(MongoDbSettings.SectionName));
builder.Services.Configure<SmsSettings>(
    builder.Configuration.GetSection(SmsSettings.SectionName));

// Allow the frontend dev server to call the API. The list is configurable via
// Cors:AllowedOrigins and falls back to the Vite default.
var allowedOrigins = builder.Configuration
    .GetSection($"{CorsSettings.SectionName}:{nameof(CorsSettings.AllowedOrigins)}")
    .Get<string[]>();

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsSettings.FrontendPolicy, policy =>
    {
        policy.WithOrigins(allowedOrigins ?? [CorsSettings.DefaultFrontendOrigin])
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// ---------------------------------------------------------------------------
// HTTP request pipeline
// ---------------------------------------------------------------------------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Dongi API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseCors(CorsSettings.FrontendPolicy);

app.MapControllers();

app.Run();
