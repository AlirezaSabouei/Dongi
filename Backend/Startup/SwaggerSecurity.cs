using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Dongi.Api.Startup;

/// <summary>
/// Swagger UI support for the JWT bearer flow. Adds an "Authorize" button and
/// marks only endpoints that actually require authentication with the bearer
/// security requirement, so anonymous auth and health endpoints stay unlocked.
/// </summary>
internal static class SwaggerSecurity
{
    private const string BearerSchemeName = "Bearer";

    public static IServiceCollection AddDongiSwagger(this IServiceCollection services)
    {
        services.AddSwaggerGen(options =>
        {
            options.AddSecurityDefinition(BearerSchemeName, new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Name = "Authorization",
                Description =
                    "Paste the JWT returned by POST /auth/verify-code. " +
                    "Swagger adds the 'Bearer ' prefix automatically.",
            });

            options.OperationFilter<AuthorizedOperationFilter>();
        });

        return services;
    }

    private sealed class AuthorizedOperationFilter : IOperationFilter
    {
        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            var metadata = context.ApiDescription.ActionDescriptor.EndpointMetadata;

            if (metadata.OfType<AllowAnonymousAttribute>().Any() ||
                !metadata.OfType<IAuthorizeData>().Any())
            {
                return;
            }

            operation.Security =
            [
                new OpenApiSecurityRequirement
                {
                    [new OpenApiSecuritySchemeReference(
                        BearerSchemeName,
                        context.Document,
                        externalResource: null)] = [],
                },
            ];
        }
    }
}
